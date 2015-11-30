/*eslint-env node*/
module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        babel: {
            options: {
                sourceMap: true,
                presets: ['es2015']
            },
            dist: {
                files: [{
                    expand: true,
                    src: ['js/*.js'],
                    dest: 'compiled',
                    ext: '.js'
                }]
            }
        },
        eslint: {
            options: {
                configFile: "eslint.json"
            },
            src: ['Gruntfile.js', 'js/*.js', 'test/*.js']
        },
        mochaTest: {
            src: ['test/*.js']
        },
        connect: {
            server: {
                options: {
                    port: 8000,
                    base: '.',
                    livereload: true,
                    open: true
                }
            }
        },
        watch: {
            js: {
                files: ['Gruntfile.js', 'js/*.js', 'test/*.js'],
                tasks: ['babel', 'eslint', 'mochaTest'],
                options: {
                    livereload: true
                }
            },
            html: {
                files: ['index.html'],
                options: {
                    livereload: true
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-mocha-test');
    grunt.loadNpmTasks('grunt-eslint');
    grunt.loadNpmTasks('grunt-babel');
    grunt.loadNpmTasks('grunt-contrib-connect');
    grunt.loadNpmTasks('grunt-contrib-watch');

    grunt.registerTask('default', ['connect', 'watch']);
};
