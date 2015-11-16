/*global d3*/
/*global newick*/
/*exported buildCactusGraph*/
/*eslint-env browser*/
function buildCactusGraph() {
    // Margin boilerplate taken from gist mbostock/3019563
    var margin = {top: 20, right: 80, bottom: 20, left: 80},
        width = 1800 - margin.left - margin.right,
        height = 900 - margin.top - margin.bottom;

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

    var data = newick.parseNewick("(a,(b,c))d;");

    var nodes = tree.nodes(data),
        links = tree.links(nodes);

    svg.selectAll("path.link")
        .data(links)
        .enter().append("path")
        .attr("class", "link")
        .attr("d", diagonal);

    var node = svg.selectAll("g.node")
        .data(nodes)
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", function(d) { return "translate(" + y(d.y) + "," + x(d.x) + ")"; });

    node.append("circle")
        .attr("r", 4.5);

    node.append("text")
        .attr("dx", function(d) { return d.children ? -8 : 8; })
        .attr("dy", 3)
        .attr("text-anchor", function(d) { return d.children ? "end" : "start"; })
        .text(function(d) { return d.name; });
}
