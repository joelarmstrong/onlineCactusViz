/*global d3*/
/*global newick*/
/*exported buildCactusGraph*/
/*eslint-env browser*/
function buildCactusGraph() {
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
            svg.selectAll("path.link")
                .attr("d", diagonal);
        }))
        .append("g")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var tree = d3.layout.tree()
        .size([height, width]);

    var diagonal = d3.svg.diagonal()
        .projection(function(d) { return [y(d.y), x(d.x)]; });

    d3.text("/cactusDump2", function (text) {
        var cactusTrees = [];
        var lines = text.split("\n");
        var pinchGraph = { nodes: {}, links: [] };
        var nodeToNet = {};
        var netToNode = {};
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var fields = line.split("\t");
            if (fields[0] == "C") {
                cactusTrees.push(newick.parseNewick(fields[1]));
            }
            if (fields[0] == "P") {
                if (!(fields[1] in pinchGraph.nodes)) {
                    pinchGraph.nodes[fields[1]] = { name: fields[1] };
                }
                if (!(fields[2] in pinchGraph.nodes)) {
                    pinchGraph.nodes[fields[2]] = { name: fields[2] };
                }
                pinchGraph.links.push({ source: pinchGraph.nodes[fields[1]],
                                        target: pinchGraph.nodes[fields[2]],
                                        name: fields[3],
                                        degree: +fields[4],
                                        length: +fields[5] });
            }
            if (fields[0] == 'M') {
                netToNode[fields[1]] = fields.slice(2);
                fields.slice(2).forEach(function (node) {
                    nodeToNet[node] = fields[1];
                });
            }
            if (fields[0] == "STEP") {
                break;
            }
        }
        var nodeArray = [];
        for (var node in pinchGraph.nodes) {
            nodeArray.push(pinchGraph.nodes[node]);
        }
        pinchGraph.nodes = nodeArray;
        cactusTrees = cactusTrees.map(function (t) { return parseCactusTree(t); });
        redraw(cactusTrees, pinchGraph, nodeToNet, netToNode);
    });
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
    function redraw(trees, pinch, nodeToNet, netToNodes) {
        var pinchG = d3.select("#pinchGraph").append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .call(d3.behavior.zoom().on("zoom", function () {
                pinchG.attr("transform", "translate(" + d3.event.translate + ")"
                            + " scale(" + d3.event.scale + ")");
            }))
            .append("g");

        var force = d3.layout.force()
            .size([width, height])
            .nodes(pinch.nodes).links(pinch.links)
            .gravity(0.06)
            .linkDistance(function (d) { return d.length; }).start();
        var drag = force.drag()
            .on("dragstart", function() { d3.event.sourceEvent.stopPropagation(); });

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
        function mouseoverNode(d) {
            var node = selectCorrespondingNetAndNodes(d);
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
            node.select("text").remove();
        }

        function mouseoverLink(d) {
            var link = d3.selectAll("g.link").filter(function(d2) {
                return d.name === d2.name;
            });
            link.select(".link").classed("active", true);
            link.append("text")
                .attr("class", "label")
                .attr("x", (d.source.x + d.target.x) / 2)
                .attr("y", (d.source.y + d.target.y) / 2)
                .attr("dx", -10)
                .attr("dy", 20)
                .text(function (d) {
                    return d.name + "\ndegree: " + d.degree + "\nlength: " + d.length;
                });
        }

        function mouseoutLink(d) {
            var link = d3.selectAll(".link").filter(function(d2) {
                return d.name === d2.name;
            });
            link.select(".link").classed("active", false);
            link.select("text").remove();
        }

        var pinchLink = pinchG.selectAll(".link")
            .data(pinch.links)
            .enter()
            .append("g")
            .attr("class", "link")
            .append("line")
            .attr("class", "link")
            .style("stroke-width", function (d) { return d.degree; })
            .on("mouseover", mouseoverLink)
            .on("mouseout", mouseoutLink);
        var pinchNode = pinchG.selectAll(".node")
            .data(pinch.nodes)
            .enter()
            .append("g")
            .attr("class", "node")
            .call(drag)
            .on("mouseover", mouseoverNode)
            .on("mouseout", mouseoutNode);

        pinchNode.append("circle")
            .attr("r", 4.5);

        force.on("tick", function () {
            pinchLink.attr("x1", function(d) { return d.source.x; })
                .attr("y1", function(d) { return d.source.y; })
                .attr("x2", function(d) { return d.target.x; })
                .attr("y2", function(d) { return d.target.y; });

            pinchNode.attr("transform", function(d) { return "translate(" + d.x + ", " + d.y + ")"; });
        });
        trees.forEach(function (data) {
            var nodes = tree.nodes(data.tree),
                links = data.links;

            svg.selectAll("path.link")
                .data(links)
                .enter()
                .append("g")
                .attr("class", "link")
                .append("path")
                .attr("class", "link")
                .attr("d", diagonal)
                .on("mouseover", mouseoverLink)
                .on("mouseout", mouseoutLink);

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
}
