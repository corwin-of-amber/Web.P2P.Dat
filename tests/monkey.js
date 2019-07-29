/**
 * The monkey is a bot that types things in a document, for testing against
 * edit race conditions.
 */

const CodeMirror = require('codemirror');


class Monkey {
    constructor() {
        this.tasks = [];
    }

    stop() {
        while (this.tasks.length > 0) {
            this.tasks.pop().stop();
        }
    }

    async typewriter(target) {
        var op = target instanceof CodeMirror ? (c => target.replaceSelection(c))
               : target.change ? (c => target.change(t => t.push(c))) : undefined;
               
        if (!op) throw new Error("Monkey cannot type on this");

        var task = new IntervalTask();
        this.tasks.push(task);

        var babble = Array.from({ length: 26 }, (_, i) => 
                                String.fromCharCode('a'.charCodeAt(0) + i));

        while (true) {
            for (let c of babble) {
                op(c);
                await task.waitForNext();
            }
            break;
        }
    }
}


class IntervalTask {
    constructor(interval=500) {
        this.next = () => {};
        this.clock = setInterval(() => this.next(), interval);
    }

    waitForNext() { return new Promise(resolve => this.next = resolve); }
    stop() { clearInterval(this.clock); }
}



module.exports = {Monkey}
