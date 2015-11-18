/*global d3*/
/*global newick*/
/*exported buildCactusGraph*/
/*eslint-env browser*/
function buildCactusGraph() {
    // Margin boilerplate taken from gist mbostock/3019563
    var margin = {top: 20, right: 80, bottom: 20, left: 80},
        width = 1550 - margin.left - margin.right,
        height = 350 - margin.top - margin.bottom;

    function zoom() {
        svg.selectAll("g.node")
            .attr("transform", function (d) {
                return "translate(" + y(d.y) + "," + x(d.x) + ")";
            });
        svg.selectAll("path.link")
            .attr("d", diagonal);
    }

    var x = d3.scale.linear()
        .domain([0, width])
        .range([0, width]);

    var y = d3.scale.linear()
        .domain([0, height])
        .range([0, height]);

    var svg = d3.select("#cactusGraph").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .call(d3.behavior.zoom().x(y).y(x).on("zoom", zoom))
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
        var regex = /(NET|CHAIN)(.*)/;
        var results = regex.exec(tree.name);
        var type = results[1];
        var name = results[2];
        tree.name = name;
        tree.type = type;
        if ('children' in tree) {
            tree.children = tree.children.map(function (child) {
                // ignore the block for now.
                return parseCactusTree(child.children[0]);
            });
        }
        return tree;
    }
    function redraw(trees, pinch, nodeToNet, netToNodes) {
        var pinchSvg = d3.select("#pinchGraph").append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .call(d3.behavior.zoom().on("zoom", zoomPinch));
        function zoomPinch() {
            pinchSvg.attr("transform", "translate(" + d3.event.translate + ")"
                          + " scale(" + d3.event.scale + ")");
        }
        var force = d3.layout.force()
            .size([width, height])
            .nodes(pinch.nodes).links(pinch.links)
            .gravity(0.06)
            .linkDistance(function (d) { return d.length; }).start();
        var drag = force.drag()
            .on("dragstart", function() { d3.event.sourceEvent.stopPropagation(); });

        function selectCorrespondingNetAndNodes(d) {
            var nodeName = d.name;
            return d3.selectAll(".node").filter(function(d) {
                if (d.name == nodeName) {
                    return true;
                }
                if (nodeName in nodeToNet) {
                    return d.name == nodeToNet[nodeName];
                } else {
                    return netToNodes[nodeName].some(function (x) { return x == d.name; });
                }
            });
        }
        function mouseoverNode(d) {
            var node = selectCorrespondingNetAndNodes(d);
            node.append("text")
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

        var pinchLink = pinchSvg.selectAll(".link")
            .data(pinch.links)
            .enter()
            .append("line")
            .attr("class", "link")
            .style("stroke-width", function (d) { return d.degree; });
            // .on("mouseover", mouseover)
            // .on("mouseout", mouseout);
        var pinchNode = pinchSvg.selectAll(".node")
            .data(pinch.nodes)
            .enter()
            .append("g")
            .attr("class", "node")
            .call(drag)
            .on("mouseover", mouseoverNode)
            .on("mouseout", mouseoutNode)
            .append("circle")
            .attr("r", 4.5);

        force.on("tick", function () {
            pinchLink.attr("x1", function(d) { return d.source.x; })
                .attr("y1", function(d) { return d.source.y; })
                .attr("x2", function(d) { return d.target.x; })
                .attr("y2", function(d) { return d.target.y; });

            pinchNode.attr("cx", function(d) { return d.x; })
                .attr("cy", function(d) { return d.y; });
        });
        trees.forEach(function (data) {
            var nodes = tree.nodes(data),
                links = tree.links(nodes);

            svg.selectAll("path.link")
                .data(links)
                .enter().append("path")
                .attr("class", "link")
                .attr("d", diagonal);
                // .on("mouseover", mouseover)
                // .on("mouseout", mouseout);

            svg.selectAll("g.node")
                .data(nodes)
                .enter().append("g")
                .attr("class", "node")
                .attr("transform", function(d) { return "translate(" + y(d.y) + "," + x(d.x) + ")"; })
                .on("mouseover", mouseoverNode)
                .on("mouseout", mouseoutNode)
                .append(function (d) {
                    if (d.type == "NET") {
                        var elem = document.createElementNS(d3.ns.prefix.svg, "circle");
                        d3.select(elem).attr("r", 4.5);
                        return elem;
                    } else if (d.type == "CHAIN") {
                        var elem = document.createElementNS(d3.ns.prefix.svg, "rect");
                        d3.select(elem).attr("width", 9).attr("height", 9)
                            .attr("transform", "translate(-4.5, -4.5)");
                        return elem;
                    }
                });
        });
    }
}
