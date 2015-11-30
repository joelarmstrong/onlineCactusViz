/*global exports*/
/*eslint-env node, browser*/
// Functions to parse a newick string to a d3-compatible tree, and get
// a newick string from a d3-compatible tree.
(function(exports) {
    exports.parseNewick = function (str) {
        var curName = '';
        var stack = [[]];
        var curNodeHasChildren = false;
        var done = false;
        function finishUpNode() {
            var curNode = { name: curName };
            if (curNodeHasChildren) {
                curNode.children = stack.pop();
            }
            curNodeHasChildren = false;
            stack[stack.length - 1].push(curNode);
            curName = '';
        }
        for (var i = 0; i < str.length; i++) {
            switch (str[i]) {
            case '(':
                stack.push([]);
                break;
            case ')':
                finishUpNode();
                curNodeHasChildren = true;
                break;
            case ',':
                finishUpNode();
                break;
            case ';':
                finishUpNode();
                done = true;
                break;
            case ' ':
            case '\n':
                break;
            default:
                curName += str[i];
                break;
            }
        }
        if (!done) {
            throw 'Unterminated newick string';
        }
        return stack.pop().pop();
    };
})(typeof exports === 'undefined' ? window.newick = {} : exports);
