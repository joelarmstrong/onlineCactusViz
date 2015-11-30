/*global d3*/
/*global newick*/
/*exported buildCactusGraph, buildPinchGraph, parseCactusDump*/
/*eslint-env browser*/

function selectCorrespondingNetAndNodes(d) {
    var nodeName = d.name;
    return d3.selectAll("g.node").filter(function(d) {
        if (d.name === nodeName) {
            return true;
        }
        if (nodeName in nodeToNet) {
            return d.name === nodeToNet[nodeName];
        } else {
            return netToNodes[nodeName].some(function (x) { return x == d.name; });
        }
    });
}

function pinchLayout(pinchData) {
    var pinch = {};
    var separation = 20;
    var blockLength = 20;
    pinch.blocks = pinchData.blocks;

    // Populate a mapping from block name to block object.
    var nameToBlock = {};
    pinch.blocks.forEach(function (b) { nameToBlock[b.name] = b; });

    pinch.ends = d3.merge(pinch.blocks.map(function (block) {
        block.end0 = { block: block, orientation: 0 };
        block.end1 = { block: block, orientation: 1 };
        block.source = block.end0;
        block.target = block.end1;
        return [block.end0, block.end1];
    }));
    var threadIdToSegments = {};
    pinch.adjacencies = d3.merge(pinch.blocks.map(function (block) {
        var leftAdjacencies = [];
        var rightAdjacencies = [];
        block.segments.forEach(function (segment) {
            segment.block = block;
            threadIdToSegments[segment.threadId] = threadIdToSegments[segment.threadId] || [];
            threadIdToSegments[segment.threadId].push(segment);

            var createAdjacency = function(otherBlock) {
                var adjacency = {};
                adjacency.threadId = segment.threadId;
                // FIXME: this is so ugly
                var otherSegment = d3.min(nameToBlock[otherBlock].segments
                                          .filter(function (s) { return s.threadId === segment.threadId; }),
                                          function (s) {
                                              return [s, d3.min([Math.abs(s.start - segment.end),
                                                                 Math.abs(s.end - segment.start)])];
                                          }, function (e) { return e[1]; })[0];
                if (segment.blockOrientation === "+") {
                    adjacency.source = segment.block.end1;
                } else {
                    adjacency.source = segment.block.end0;
                }
                if (otherSegment.blockOrientation === "+") {
                    adjacency.target = nameToBlock[otherBlock].end0;
                } else {
                    adjacency.target = nameToBlock[otherBlock].end1;
                }
                adjacency.length = otherSegment.start - segment.end;
                return adjacency;
            };
            if (segment.rightAdjacentBlock !== "(nil)") {
                segment.rightAdjacency = createAdjacency(segment.rightAdjacentBlock);
                rightAdjacencies.push(segment.rightAdjacency);
            }
        });
        return d3.merge([leftAdjacencies, rightAdjacencies]);
    }));

    // Find multiplicity of adjacencies, so they can be drawn without overlap.
    var adjacencyMultiplicity = {};
    pinch.adjacencies.forEach(function (a) {
        var min = d3.min([a.source.block.name, a.target.block.name]);
        var max = d3.max([a.source.block.name, a.target.block.name]);
        adjacencyMultiplicity[min] = adjacencyMultiplicity[min] || {};
        adjacencyMultiplicity[min][max] = adjacencyMultiplicity[min][max] || [];
        adjacencyMultiplicity[min][max].push(a);
    });
    for (var i in adjacencyMultiplicity) {
        for (var j in adjacencyMultiplicity[i]) {
            var adjacencies = adjacencyMultiplicity[i][j];
            for (var k = 0; k < adjacencies.length; k++) {
                adjacencies[k].multiplicity = adjacencies.length;
                adjacencies[k].adjNumber = k;
            }
        }
    }

    // Greedy layout of pinches: pick an arbitrary thread to start,
    // draw its first block, then iteratively draw the next remaining block
    // with the shortest adjacency length.
    var drawnBlocks = d3.set();
    var curY = 0;
    for (var threadId in threadIdToSegments) {
        var sortedSegments = threadIdToSegments[threadId].sort(function (s1, s2) { return s1.start - s2.start; });
        var blockStack = [{ length: 0, block: sortedSegments[0].block }];
        var blocksInStack = d3.set();
        blocksInStack.add(blockStack[0].name);
        var stackInsertionIndex = d3.bisector(function(a, b) { return b.length - a.length; }).left;
        var curX = 0;
        while (blockStack.length > 0) {
            var entry = blockStack.pop();
            var block = entry.block;
            if (drawnBlocks.has(block.name)) {
                continue;
            }

            block.end0.x = curX;
            block.end0.y = curY - 10 * blockStack.length;
            curX += blockLength + block.segments[0].end - block.segments[0].start;
            block.end1.x = curX;
            block.end1.y = curY - 10 * blockStack.length;
            curX += separation;

            block.segments.forEach(function (segment) {
                if (segment.rightAdjacentBlock !== "(nil)") {
                    var newEntry = { length: segment.rightAdjacency.length,
                                     block: nameToBlock[segment.rightAdjacentBlock] };
                    var insertionIndex = stackInsertionIndex(blockStack, newEntry);
                    if (!blocksInStack.has(newEntry.block.name)) {
                        blockStack.splice(insertionIndex, 0, newEntry);
                        blocksInStack.add(newEntry.block.name);
                    }
                }
            });

            drawnBlocks.add(block.name);
        }
        curY += 2 * separation;
    }
    return pinch;
}

function parseCactusDump(dumpUrl, callback) {
    d3.text(dumpUrl, function (text) {
        function parseCactusTree(tree) {
            var links = [];
            function recurse(subtree) {
                var nodeRegex = /(NET|CHAIN)(.*)/;
                var results = nodeRegex.exec(subtree.name);
                var type = results[1];
                var name = results[2];
                subtree.name = name;
                subtree.type = type;
                if ('children' in subtree) {
                    subtree.children = subtree.children.map(function (child) {
                        var blockRegex = /BLOCK(.*)/;
                        var results = blockRegex.exec(child.name);
                        var name = results[1];
                        var grandChild = recurse(child.children[0]);
                        links.push({ name: name, source: subtree, target: grandChild});
                        return grandChild;
                    });
                }
                return subtree;
            }
            tree = recurse(tree);
            var ret = { tree: tree, links: links };
            return ret;
        }

        var cactusTrees = [];
        var lines = text.split("\n");
        var pinchGraph = { blocks: [] };
        var nodeToNet = {};
        var netToNodes = {};
        function sextuplets(array) {
            var ret = [];
            for (var i = 0; i < array.length; i += 6) {
                ret.push([array[i], array[i + 1], array[i + 2], array[i + 3],
                          array[i + 4], array[i + 5]]);
            }
            return ret;
        }
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var fields = line.split("\t");
            if (fields[0] == "C") {
                cactusTrees.push(newick.parseNewick(fields[1]));
            }
            if (fields[0] == 'G') {
                pinchGraph.blocks.push({ name: fields[1],
                                         segments: sextuplets(fields.slice(2)).map(function (segment) {
                                             return { threadId: segment[0],
                                                      start: +segment[1],
                                                      end: +segment[2],
                                                      rightAdjacentBlock: segment[3],
                                                      leftAdjacentBlock: segment[4],
                                                      blockOrientation: segment[5] };
                                         }) });
            }
            if (fields[0] == 'M') {
                netToNodes[fields[1]] = fields.slice(2);
                fields.slice(2).forEach(function (node) {
                    nodeToNet[node] = fields[1];
                });
            }
            if (fields[0] == "STEP") {
                break;
            }
        }

        cactusTrees = cactusTrees.map(function (t) { return parseCactusTree(t); });
        callback({ cactusTrees: cactusTrees,
                   nodeToNet: nodeToNet,
                   netToNodes: netToNodes,
                   pinchData: pinchGraph });
    });
}

function buildPinchGraph(pinchData) {
    var margin = {top: 20, right: 80, bottom: 20, left: 80},
        width = 1550 - margin.left - margin.right,
        height = 350 - margin.top - margin.bottom;

    var pinchZoom = d3.behavior.zoom().on("zoom", function () {
        zoomContainer.attr("transform", "translate(" + d3.event.translate + ")"
                           + "scale(" + d3.event.scale + ")");
    });
    var pinch = pinchLayout(pinchData);
    var pinchG = d3.select("#pinchGraph").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .call(pinchZoom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var zoomContainer = pinchG.append("g");

    function mouseoverNode(d) {
        var node = selectCorrespondingNetAndNodes(d);

        node.append("text")
            .attr("class", "label")
            .attr("dx", function(d) { return d.children ? -8 : 8; })
            .attr("dy", 3)
            .style("stroke-width", 5)
            .style("stroke", "white")
            .style("fill", "white")
            .attr("text-anchor", function(d) { return d.children ? "end" : "start"; })
            .text(function(d) { return d.name; });

        node.append("text")
            .attr("class", "label")
            .attr("dx", function(d) { return d.children ? -8 : 8; })
            .attr("dy", 3)
            .attr("text-anchor", function(d) { return d.children ? "end" : "start"; })
            .text(function(d) { return d.name; });


        node.select("circle").classed("active", true);
        node.select("rect").classed("active", true);
    }

    function mouseoutNode(d) {
        var node = selectCorrespondingNetAndNodes(d);
        node.select("circle").classed("active", false);
        node.select("rect").classed("active", false);
        node.selectAll("text").remove();
    }

    function mouseoverBlock(d) {
        var block = d3.selectAll("g.block").filter(function(d2) {
            return d.name === d2.name;
        });
        block.select(".block").classed("active", true);
        block.append("text")
            .attr("class", "label")
            .attr("x", (d.source.x + d.target.x) / 2)
            .attr("y", (d.source.y + d.target.y) / 2)
            .attr("dx", -10)
            .attr("dy", 20)
            .text(function (d) {
                return d.name + "\ndegree: " + d.segments.length + "\nlength: " + d.length;
            });
    }

    function mouseoutBlock(d) {
        var block = d3.selectAll(".block").filter(function(d2) {
            return d.name === d2.name;
        });
        block.select(".block").classed("active", false);
        block.selectAll("text").remove();
    }

    function pinchAdjacencyPath(d) {
        /* Draw the path for a pinch adjacency so that:
           - multiple adjacencies are clearly separated
           - long adjacencies are separated from the rest, even if
           there is no change in y */

        var apexX = (d.source.x + d.target.x) / 2;
        var apexY = (d.source.y + d.target.y) / 2;
        if (isNaN(apexY)) {
            throw 'nan';
        }
        if (d.multiplicity % 2 === 0 && d.adjNumber === 0) {
            apexY += 30 * Math.pow(-1, d.adjNumber);
        } else if (d.multiplicity % 2 === 0) {
            apexY += d.adjNumber * 30 * Math.pow(-1, d.adjNumber);
        } else {
            apexY += Math.ceil(d.adjNumber / 2) * 30 * Math.pow(-1, d.adjNumber);
        }
        if (Math.abs(d.target.x - d.source.x) > 20) {
            apexY += d.target.x - d.source.x;
        }
        return "M " + d.source.x + " " + d.source.y
            + " Q " + apexX + " " + apexY
            + " " + d.target.x + " " + d.target.y;
    }

    var pinchAdjacency = zoomContainer.selectAll(".adjacency")
        .data(pinch.adjacencies)
        .enter()
        .append("path")
        .attr("d", pinchAdjacencyPath)
        .attr("class", "adjacency")
        .attr("multiplicity", function (d) { return d.multiplicity; })
        .attr("adjIndex", function (d) { return d.adjNumber; });

    var pinchBlock = zoomContainer.selectAll(".block")
        .data(pinch.blocks)
        .enter()
        .append("g")
        .attr("class", "block")
        .append("line")
        .attr("class", "block")
        .attr("x1", function (d) { return d.end0.x; })
        .attr("y1", function (d) { return d.end0.y; })
        .attr("x2", function (d) { return d.end1.x; })
        .attr("y2", function (d) { return d.end1.y; })
        .style("stroke-width", function (d) { return d.segments.length; })
        .on("mouseover", mouseoverBlock)
        .on("mouseout", mouseoutBlock);

    var pinchNode = zoomContainer.selectAll(".node")
        .data(pinch.ends)
        .enter()
        .append("g")
        .attr("class", "node")
        .on("mouseover", mouseoverNode)
        .on("mouseout", mouseoutNode);

    pinchNode.append("circle")
        .attr("r", 4.5)
        .attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; });
}

function buildCactusGraph(trees) {
    // Margin boilerplate taken from gist mbostock/3019563
    var margin = {top: 20, right: 80, bottom: 20, left: 80},
        width = 1550 - margin.left - margin.right,
        height = 350 - margin.top - margin.bottom;

    var x = d3.scale.linear()
        .domain([0, width])
        .range([0, width]);

    var y = d3.scale.linear()
        .domain([0, height])
        .range([0, height]);

    var svg = d3.select("#cactusGraph").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .call(d3.behavior.zoom().x(y).y(x).on("zoom", function () {
            svg.selectAll("g.node")
                .attr("transform", function (d) {
                    return "translate(" + y(d.y) + "," + x(d.x) + ")";
                });
            svg.selectAll("path.block")
                .attr("d", diagonal);
        }))
        .append("g")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var tree = d3.layout.tree()
        .size([height, width]);

    var diagonal = d3.svg.diagonal()
        .projection(function(d) { return [y(d.y), x(d.x)]; });

    trees.forEach(function (data) {
        var nodes = tree.nodes(data.tree),
            links = data.links;

        function mouseoverNode(d) {
            var node = selectCorrespondingNetAndNodes(d);

            node.append("text")
                .attr("class", "label")
                .attr("dx", function(d) { return d.children ? -8 : 8; })
                .attr("dy", 3)
                .style("stroke-width", 5)
                .style("stroke", "white")
                .style("fill", "white")
                .attr("text-anchor", function(d) { return d.children ? "end" : "start"; })
                .text(function(d) { return d.name; });

            node.append("text")
                .attr("class", "label")
                .attr("dx", function(d) { return d.children ? -8 : 8; })
                .attr("dy", 3)
                .attr("text-anchor", function(d) { return d.children ? "end" : "start"; })
                .text(function(d) { return d.name; });


            node.select("circle").classed("active", true);
            node.select("rect").classed("active", true);
        }

        function mouseoutNode(d) {
            var node = selectCorrespondingNetAndNodes(d);
            node.select("circle").classed("active", false);
            node.select("rect").classed("active", false);
            node.selectAll("text").remove();
        }

        function mouseoverBlock(d) {
            var block = d3.selectAll("g.block").filter(function(d2) {
                return d.name === d2.name;
            });
            block.select(".block").classed("active", true);
            block.append("text")
                .attr("class", "label")
                .attr("x", (d.source.x + d.target.x) / 2)
                .attr("y", (d.source.y + d.target.y) / 2)
                .attr("dx", -10)
                .attr("dy", 20)
                .text(function (d) {
                    return d.name + "\ndegree: " + d.segments.length + "\nlength: " + d.length;
                });
        }

        function mouseoutBlock(d) {
            var block = d3.selectAll(".block").filter(function(d2) {
                return d.name === d2.name;
            });
            block.select(".block").classed("active", false);
            block.selectAll("text").remove();
        }

        svg.selectAll("path.block")
            .data(links)
            .enter()
            .append("g")
            .attr("class", "block")
            .append("path")
            .attr("class", "block")
            .attr("d", diagonal)
            .on("mouseover", mouseoverBlock)
            .on("mouseout", mouseoutBlock);

        svg.selectAll("g.node")
            .data(nodes)
            .enter().append("g")
            .attr("class", "node")
            .attr("transform", function(d) { return "translate(" + y(d.y) + "," + x(d.x) + ")"; })
            .on("mouseover", mouseoverNode)
            .on("mouseout", mouseoutNode)
            .append(function (d) {
                var elem;
                if (d.type == "NET") {
                    // Nets are represented by a circle.
                    elem = document.createElementNS(d3.ns.prefix.svg, "circle");
                    d3.select(elem).attr("r", 4.5);
                } else if (d.type == "CHAIN") {
                    // Chains are represented by a square. Since
                    // rects have their top-left corner at their
                    // x,y coordinates, we need to shift it a bit
                    // to center it properly.
                    elem = document.createElementNS(d3.ns.prefix.svg, "rect");
                    d3.select(elem).attr("width", 9).attr("height", 9)
                        .attr("transform", "translate(-4.5, -4.5)");
                }
                return elem;
            });
    });
}
