/*global d3*/
/*global newick*/
/*exported buildCactusGraph, buildPinchGraph, parseCactusDump*/
/*eslint-env browser*/

function findEnclosingBoundingBox(elements) {
    // Find the bounding box around all elements in the array.
    let minX = Number.MAX_VALUE, maxX = -Number.MAX_VALUE,
        minY = Number.MAX_VALUE, maxY = -Number.MAX_VALUE;
    elements.forEach(function (e) {
        let bbox = e.getBBox();
        minX = Math.min(minX, bbox.x);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        minY = Math.min(minY, bbox.y);
        maxY = Math.max(maxY, bbox.y + bbox.height);
    });
    return [minX, maxX, minY, maxY];
}

function zoomToBox(zoom, x1, x2, y1, y2) {
    // Ensure that we can't get negative values for x2 - x1 and y2 - y1.
    [x1, x2] = d3.extent([x1, x2]);
    [y1, y2] = d3.extent([y1, y2]);

    let [width, height] = zoom.size(),
        widthScale = width / (x2 - x1),
        heightScale = height / (y2 - y1);
    zoom.scale(Math.min(widthScale, heightScale));
    // The height (in data space) covered by the window.
    let dataHeight = height / zoom.scale();
    // The width (in data space) covered by the window.
    let dataWidth = width / zoom.scale();
    zoom.translate([(-x1 + (dataWidth - (x2 - x1)) / 2) * zoom.scale(),
                    (-y1 + (dataHeight - (y2 - y1)) / 2) * zoom.scale()]);
}

function mouseoverNode(d) {
    var node = d3.select(this);

    let text;
    if (d.type === 'CHAIN') {
        let length = 0;
        d3.selectAll('path.block').filter(d2 => d2.source === d || d2.target === d).each(d2 => length += d2.length);
        text = `${d.name}
                length: ${length}`;
    } else {
        text = `${d.name}`;
    }

    node.append('text')
        .attr('class', 'shadow')
        .attr('dx', d => d.children ? -8 : 8)
        .attr('dy', 3)
        .attr('text-anchor', d => d.children ? 'end' : 'start')
        .text(text);

    node.append('text')
        .attr('class', 'label')
        .attr('dx', d => d.children ? -8 : 8)
        .attr('dy', 3)
        .attr('text-anchor', d => d.children ? 'end' : 'start')
        .text(text);

    node.select('circle').classed('active', true);
    node.select('rect').classed('active', true);
}

function mouseoutNode() {
    var node = d3.select(this);
    node.select('circle').classed('active', false);
    node.select('rect').classed('active', false);
    node.selectAll('text').remove();
}

function mouseoverBlock(d) {
    var block = d3.selectAll('g.block').filter(d2 => d.name === d2.name);
    block.select('.block').classed('active', true);
    block.append('text')
         .attr('class', 'label')
         .attr('x', (d.source.x + d.target.x) / 2)
         .attr('y', (d.source.y + d.target.y) / 2)
         .attr('dx', -10)
         .attr('dy', 20)
         .text(d => `${d.name}\ndegree: ${d.segments.length}\nlength: ${d.length}`);
}

function mouseoutBlock(d) {
    var block = d3.selectAll('.block').filter(d2 => d.name === d2.name);
    block.select('.block').classed('active', false);
    block.selectAll('text').remove();
}

function mouseoverAdjacency() {
    d3.select(this).classed('active', true);
}

function mouseoutAdjacency() {
    d3.select(this).classed('active', false);
}

function pinchLayout(pinchData) {
    var pinch = {};
    var separation = 20;
    var blockLength = 20;
    pinch.blocks = pinchData.blocks;

    // Populate a mapping from block name to block object.
    var nameToBlock = {};
    pinch.blocks.forEach(b => nameToBlock[b.name] = b);

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
                                          .filter(s => s.threadId === segment.threadId),
                                          s => [s, d3.min([Math.abs(s.start - segment.end),
                                                           Math.abs(s.end - segment.start)])],
                                          function (e) { return e[1]; })[0];
                if (segment.blockOrientation === '+') {
                    adjacency.source = segment.block.end1;
                } else {
                    adjacency.source = segment.block.end0;
                }
                if (otherSegment.blockOrientation === '+') {
                    adjacency.target = nameToBlock[otherBlock].end0;
                } else {
                    adjacency.target = nameToBlock[otherBlock].end1;
                }
                adjacency.length = otherSegment.start - segment.end;
                adjacency.component = segment.rightAdjComponent;
                return adjacency;
            };
            if (segment.rightAdjacentBlock !== '(nil)') {
                segment.rightAdjacency = createAdjacency(segment.rightAdjacentBlock);
                rightAdjacencies.push(segment.rightAdjacency);
            }
        });
        return d3.merge([leftAdjacencies, rightAdjacencies]);
    }));

    // Find multiplicity of adjacencies, so they can be drawn without overlap.
    var adjacencyMultiplicity = {};
    pinch.adjacencies.forEach(function (a) {
        let [min, max] = d3.extent([`${a.source.block.name}0`, `${a.target.block.name}1`]);
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
        var sortedSegments = threadIdToSegments[threadId].sort((s1, s2) => s1.start - s2.start);
        var blockStack = [{ length: 0, block: sortedSegments[0].block }];
        var blocksInStack = d3.set();
        blocksInStack.add(blockStack[0].name);
        var stackInsertionIndex = d3.bisector((a, b) => b.length - a.length).left;
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
                if (segment.rightAdjacentBlock !== '(nil)') {
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

    pinch.threads = [];
    for (let threadId in threadIdToSegments) {
        pinch.threads.push(threadId);
    }

    return pinch;
}

function parseCactusDump(lines) {
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
                    let blockRegex = /BLOCK(.*)_(.*)/;
                    let [, name, length] = blockRegex.exec(child.name);
                    let grandChild = recurse(child.children[0]);
                    links.push({ name: name, length: +length, source: subtree, target: grandChild});
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
    var pinchGraph = { blocks: [] };
    var componentToNet = {};
    var netToComponents = {};
    function octuplets(array) {
        var ret = [];
        for (var i = 0; i < array.length; i += 8) {
            ret.push([array[i], array[i + 1], array[i + 2], array[i + 3],
                      array[i + 4], array[i + 5], array[i + 6], array[i + 7]]);
        }
        return ret;
    }
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var fields = line.split('\t');
        if (fields[0] === 'C') {
            cactusTrees.push(newick.parseNewick(fields[1]));
        }
        if (fields[0] === 'G') {
            pinchGraph.blocks.push({ name: fields[1],
                                     segments: octuplets(fields.slice(2)).map(function (segment) {
                                         return { threadId: segment[0],
                                                  start: +segment[1],
                                                  end: +segment[2],
                                                  rightAdjacentBlock: segment[3],
                                                  leftAdjacentBlock: segment[4],
                                                  blockOrientation: segment[5],
                                                  leftAdjComponent: segment[6],
                                                  rightAdjComponent: segment[7] };
                                     }) });
        }
        if (fields[0] === 'M') {
            netToComponents[fields[1]] = fields.slice(2);
            fields.slice(2).forEach(function (node) {
                componentToNet[node] = fields[1];
            });
        }
    }

    cactusTrees = cactusTrees.map(t => parseCactusTree(t));
    return { cactusTrees: cactusTrees,
             componentToNet: componentToNet,
             netToComponents: netToComponents,
             pinchData: pinchGraph };
}

function buildPinchGraph(margin={top: 80, right: 80, bottom: 80, left: 80}) {
    let width = 1550 - margin.left - margin.right,
        height = 350 - margin.top - margin.bottom;

    var pinchZoom = d3.behavior.zoom()
            .size([width, height])
            .on('zoom', function () {
                zoomContainer.attr('transform', `translate(${d3.event.translate})`
                                   + `scale(${d3.event.scale})`);
            })
            .scaleExtent([0, 3]);
    var pinchG = d3.select('#pinchGraph').append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .call(pinchZoom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

    pinchG.append('marker')
        .attr('id', 'arrowhead')
        .attr('orient', 'auto')
        .attr('markerWidth', 4)
        .attr('markerHeight', 4)
        .attr('refX', 5)
        .attr('refY', 2)
        .append('path')
        .attr('d', 'M0,0 L0,4 L4,2 L0,0')
        .style('opacity', 0.8);

    var zoomContainer = pinchG.append('g');

    // Need to keep a list of the threads here--otherwise the color
    // for a particular thread can change if new threads are added.
    let pinchThreads = [];
    return {
        zoomToBlocks: function zoomToBlocks(names) {
            let elements = [];
            pinchG.selectAll("g.block").filter(d => names.indexOf(d.name) >= 0).each(function () { elements.push(this); });
            let [minX, maxX, minY, maxY] = findEnclosingBoundingBox(elements);
            let paddingRatio = 0.0,
                horizontalPadding = paddingRatio * (maxX - minX),
                verticalPadding = paddingRatio * (maxY - minY);
            zoomToBox(pinchZoom,
                      minX - horizontalPadding,
                      maxX + horizontalPadding,
                      minY - verticalPadding,
                      maxY + verticalPadding);
            zoomContainer.call(pinchZoom.event);
        },
        zoomToAdjacencyComponents: function zoomToAdjacencyComponents(componentNames) {
            let elements = [];
            pinchG.selectAll('.adjacency').filter(d => componentNames.indexOf(d.component) >= 0).each(function () { elements.push(this); });
            let [minX, maxX, minY, maxY] = findEnclosingBoundingBox(elements);
            zoomToBox(pinchZoom, minX, maxX, minY, maxY);
            zoomContainer.call(pinchZoom.event);
        },
        highlightAdjacencyComponent: function highlightAdjacencyComponent(componentName) {
            pinchG.selectAll('.adjacency').filter(d => d.component === componentName).each(mouseoverAdjacency);
        },
        unhighlightAdjacencyComponent: function unhighlightAdjacencyComponent(componentName) {
            pinchG.selectAll('.adjacency').filter(d => d.component === componentName).each(mouseoutAdjacency);
        },
        update: function updatePinchGraph(pinchData, arrowheads=false, transitionTime=1000) {
            var pinch = pinchLayout(pinchData);
            function pinchAdjacencyPath(d) {
                /* Draw the path for a pinch adjacency so that:
                 - multiple adjacencies are clearly separated
                 - long adjacencies are separated from the rest, even if
                 there is no change in y
                 - self-loops on block ends are visible */
                if (d.source.x === d.target.x && d.source.y === d.target.y) {
                    // Self-loops need to loop up and around a bit so that
                    // they're actually visible.
                    let controlPointDy = -30 * (d.adjNumber + 1);
                    if (d.source === d.source.block.end0) {
                        return `M ${d.source.x} ${d.source.y}`
                            +  ` c 30 ${controlPointDy} -30 ${controlPointDy} 0 0`;
                    } else {
                        // If this is the rightmost end of the block,
                        // we should loop around clockwise rather than
                        // counterclockwise, so the adjacency
                        // arrowhead points toward where the thread is
                        // headed.
                        return `M ${d.source.x} ${d.source.y}`
                            +  ` c -30 ${controlPointDy} 30 ${controlPointDy} 0 0`;
                    }
                }

                var apexX = (d.source.x + d.target.x) / 2;
                var apexY = (d.source.y + d.target.y) / 2;
                if (Number.isNaN(apexY)) {
                    throw 'adjacency position could not be computed';
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
                return `M ${d.source.x} ${d.source.y}`
                    + ` Q ${apexX} ${apexY}`
                    + ` ${d.target.x} ${d.target.y}`;
            }

            // add any new entries in pinch.threads to the *end* of
            // pinchThreads, so that each thread has a constant color.
            pinch.threads.forEach(function(thread) {
                if (!pinchThreads.indexOf(thread) >= 0) {
                    pinchThreads.push(thread);
                }
            });
            var pinchThreadColors = d3.scale.category10().domain(pinchThreads);

            var pinchAdjacency = zoomContainer.selectAll('.adjacency')
                    .data(pinch.adjacencies);

            pinchAdjacency.enter()
                .append('path')
                .attr('class', 'adjacency')
                .on('mouseover', mouseoverAdjacency)
                .on('mouseout', mouseoutAdjacency);

            pinchAdjacency
                .transition().duration(transitionTime)
                .attr('d', pinchAdjacencyPath)
                .attr('multiplicity', d => d.multiplicity)
                .attr('adjIndex', d => d.adjNumber)
                .style('stroke', d => pinchThreadColors(d.threadId));

            if (arrowheads) {
                pinchAdjacency.attr('marker-end', 'url(#arrowhead)');
            } else {
                pinchAdjacency.attr('marker-end', null);
            }

            pinchAdjacency.exit().remove();

            console.log(`pinchAdjacency entering: ${pinchAdjacency.enter().size()} updating: ${pinchAdjacency.size()} leaving: ${pinchAdjacency.exit().size()}`);

            var pinchBlock = zoomContainer.selectAll('g.block')
                    .data(pinch.blocks, d => d.name);

            console.log(`pinchBlock entering: ${pinchBlock.enter().size()} updating: ${pinchBlock.size()} leaving: ${pinchBlock.exit().size()}`);

            pinchBlock.enter()
                .append('g')
                .attr('class', 'block')
                .append('line')
                .attr('class', 'block')
                .on('mouseover', mouseoverBlock)
                .on('mouseout', mouseoutBlock);

            pinchBlock.select('line')
                .transition().duration(transitionTime)
                .attr('x1', d => d.end0.x)
                .attr('y1', d => d.end0.y)
                .attr('x2', d => d.end1.x)
                .attr('y2', d => d.end1.y)
                .style('stroke-width', d => d.segments.length);

            pinchBlock.exit().remove();

            let pinchNode = zoomContainer.selectAll('.end')
                    .data(pinch.ends);

            console.log(`pinchNode entering: ${pinchNode.enter().size()} updating: ${pinchNode.size()} leaving: ${pinchNode.exit().size()}`);

            // Add the SVG elements for the new ends.
            pinchNode.enter()
                .append('g')
                .attr('class', 'end')
                .append('circle');

            // Update existing and new ends.
            pinchNode.select('circle')
                .transition().duration(transitionTime)
                .attr('r', 4.5)
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);

            // Remove old ends that are no longer present.
            pinchNode.exit().remove();
        }
    };
}

function layoutForest() {
    let tree = d3.layout.tree();
    tree.realNodes = tree.nodes;
    tree.nodes = function (nodes) {
        let fakeRoot = {children: nodes};
        let ret = tree.realNodes(fakeRoot);
        ret = ret.filter(node => node !== fakeRoot);
        return ret;
    };
    return tree;
}

function buildCactusGraph(margin={top: 20, right: 80, bottom: 20, left: 80}) {
    // Margin boilerplate taken from gist mbostock/3019563
    let width = 1550 - margin.left - margin.right,
        height = 350 - margin.top - margin.bottom;

    var x = d3.scale.linear()
            .domain([0, width])
            .range([0, width]);

    var y = d3.scale.linear()
            .domain([0, height])
            .range([0, height]);

    let zoom = d3.behavior.zoom().x(y).y(x).size([width, height]).on('zoom', function () {
        svg.selectAll('.net')
            .attr('transform', d => `translate(${y(d.y)}, ${x(d.x)})`);
        svg.selectAll('.chain')
            .attr('transform', d => `translate(${y(d.y)}, ${x(d.x)})`);
        svg.selectAll('path.block')
            .attr('d', diagonal);
    });

    var svg = d3.select('#cactusGraph').append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .call(zoom)
            .append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

    let forest = layoutForest().size([height, width]);

    var diagonal = d3.svg.diagonal()
            .projection(d => [y(d.y), x(d.x)]);

    return {
        highlightNet: function highlightNet(name) {
            svg.selectAll('g.net').filter(d => d.name === name).each(mouseoverNode);
        },
        unhighlightNet: function unhighlightNet(name) {
            svg.selectAll('g.net').filter(d => d.name === name).each(mouseoutNode);
        },
        zoomToNet: function zoomToNet(name) {
            let net = svg.selectAll('g.net').filter(d => d.name === name);
            let d = net.data()[0];
            zoomToBox(zoom, d.y - 50, d.y + 50, d.x - 50, d.x + 50);
            svg.call(zoom.event);
        },
        zoomToBlock: function zoomToBlock(name) {
            let block = svg.selectAll('path.block').filter(d => d.name === name);
            let d = block.data()[0];
            let paddingRatio = 0.5,
                horizontalPadding = paddingRatio * (d.target.y - d.source.y),
                verticalPadding = paddingRatio * (d.target.x - d.source.x);
            zoomToBox(zoom,
                      d.source.y - horizontalPadding,
                      d.target.y + horizontalPadding,
                      d.source.x - verticalPadding,
                      d.target.x + verticalPadding);
            svg.call(zoom.event);
        },
        update: function updateCactusGraph(data, transitionTime=1000) {
            var nodes = forest.nodes(data.map(d => d.tree)),
                links = data.reduce((a, e) => a.concat(e.links), []);

            let cactusBlocks = svg.selectAll('g.block')
                    .data(links, d => d.name);

            console.log(`cactusBlocks entering: ${cactusBlocks.enter().size()} updating: ${cactusBlocks.size()} leaving: ${cactusBlocks.exit().size()}`);

            cactusBlocks.transition().duration(transitionTime).style('opacity', 1).select('path').attr('d', diagonal);

            let newBlockG = cactusBlocks.enter()
                .append('g')
                .attr('class', 'block');
            newBlockG
                .append('path')
                .attr('class', 'block')
                .on('mouseover', mouseoverBlock)
                .on('mouseout', mouseoutBlock)
                .attr('d', diagonal);
            newBlockG
                .style('opacity', 0)
                .transition()
                .duration(transitionTime)
                .style('opacity', 1);

            cactusBlocks.exit().transition().duration(transitionTime).style('opacity', 0.0).transition().remove();

            let netData = nodes.filter(d => d.type === 'NET');
            let chainData = nodes.filter(d => d.type === 'CHAIN');
            let nets = svg.selectAll('g.net')
                    .data(netData, d => d.name);

            console.log(`nets entering: ${nets.enter().size()} updating: ${nets.size()} leaving: ${nets.exit().size()}`);

            nets.transition().duration(transitionTime).attr('transform', d => `translate(${y(d.y)}, ${x(d.x)})`).style('opacity', 1);

            nets.enter()
                .append('g')
                .attr('class', 'net')
                .attr('transform', d => `translate(${y(d.y)}, ${x(d.x)})`)
                .on('mouseover', mouseoverNode)
                .on('mouseout', mouseoutNode)
                .append('circle')
                .attr('r', 4.5)
                .style('opacity', 0)
                .transition().duration(transitionTime).style('opacity', 1);

            nets.exit().transition().duration(transitionTime).style('opacity', 0.0).transition().remove();

            let chains = svg.selectAll('g.chain')
                    .data(chainData, d => d.name);

            chains.transition().duration(transitionTime).attr('transform', d => `translate(${y(d.y)}, ${x(d.x)})`).style('opacity', 1);

            chains.enter()
                .append('g')
                .attr('class', 'chain')
                .attr('transform', d => `translate(${y(d.y)}, ${x(d.x)})`)
                .on('mouseover', mouseoverNode)
                .on('mouseout', mouseoutNode)
                .on('mouseover.highlightChain', function mouseoverHighlightChain(d) {
                    cactusBlocks
                        .select('path')
                        .filter(d2 => d2.source === d || d2.target === d)
                        .each(function() { this.dispatchEvent(new MouseEvent('mouseover')); });
                })
                .on('mouseout.highlightChain', function mouseoutHighlightChain(d) {
                    cactusBlocks
                        .select('path')
                        .filter(d2 => d2.source === d || d2.target === d)
                        .each(function() { this.dispatchEvent(new MouseEvent('mouseout')); });
                })
                .append('rect')
                .attr('width', 9)
                .attr('height', 9)
                .attr('transform', 'translate(-4.5, -4.5)')
                .style('opacity', 0)
                .transition().duration(transitionTime).style('opacity', 1);

            chains.exit().transition().duration(transitionTime).style('opacity', 0.0).transition().remove();
        }
    };
}

