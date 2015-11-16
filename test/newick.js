/*eslint-env mocha, node*/
var assert = require('assert');

var newick = require('../js/newick');

describe('newick', function () {
    describe('parseNewick', function () {
        it('should parse a simple newick string correctly', function () {
            var newickStr = '(node1,(node2,node3))root;';
            var truth = {
                name: 'root',
                children: [
                    { name: 'node1' },
                    {
                        name: '',
                        children: [
                            { name: 'node2' },
                            { name: 'node3' }
                        ]
                    }
                ]
            };
            assert.deepEqual(newick.parseNewick(newickStr), truth);
        });
        it('should handle trees of arbitrary degree', function () {
            var newickStr = '((((node1,node2,node3,node4)grandchild))root;';
            var truth = {
                name: 'root',
                children: [
                    { name: '',
                      children: [
                          { name: 'grandchild',
                            children: [
                                { name: 'node1' },
                                { name: 'node2' },
                                { name: 'node3' },
                                { name: 'node4' }
                            ]
                          }
                      ]
                    }
                ]
            };
            assert.deepEqual(newick.parseNewick(newickStr), truth);
        });
        it('should ignore whitespace', function () {
            var newickStr = '(node1,\n(node2 ,     node3) )root;';
            var truth = {
                name: 'root',
                children: [
                    { name: 'node1' },
                    { name: '',
                      children: [
                          { name: 'node2' },
                          { name: 'node3' }
                      ]
                    }
                ]
            };
            assert.deepEqual(newick.parseNewick(newickStr), truth);
        });
        it('should handle single-node trees', function () {
            var newickStr = 'root;';
            var truth = { name: 'root' };
            assert.deepEqual(newick.parseNewick(newickStr), truth);
        });
        it('should handle quoted strings', function () {
            var newickStr = "('node 1', 'node;2', 'node,3', 'node''4')'ro:ot';";
            var truth = { name: 'ro:ot',
                          children: [
                              { name: 'node 1' },
                              { name: 'node;2' },
                              { name: 'node,3' },
                              { name: "node'4" }
                          ]
                        };
            assert.deepEqual(newick.parseNewick(newickStr), truth);
        });
    });
});
