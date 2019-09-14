const _ = require('lodash'),
      assert = require('assert'),
      {TextOperation} = require('firepad-core');



/**
 * Firepad tree merging logic.
 */
class FirepadTreeMerge {

    constructor() {
        this.operations = []
        this.applied = new Map();
        this.residues = new Map();
        this.ownIds = new Set();
    }

    static from(operations) {
        var tm = new this();
        for (let [index, entry] of operations.entries()) {
            tm.insert(index, entry);
        }
        return tm;
    }

    newOperation(operation, id) {
        var tip = this.operations.slice(-1)[0],
            parentLink = tip && [tip.id, tip.v.length - 1],
            e = {id, v:[{o:operation, p:parentLink}]};
        return e;
    }

    push(operation) {
        this.operations.push(operation);
        this.applied.set(operation.id, operation.v[0].o);
        this.ownIds.add(operation.id);
    }

    insert(index, operation) {
        let incoming = operation.v.slice(-1)[0],
            [residue, adj] = this.preadjust(index, incoming),
            ret = this.postadjust(index, adj);
        this.operations.splice(index, 0, operation);
        this.applied.set(operation.id, adj);
        this.residues.set(operation.id, residue);
        return ret;
    }

    recompose() {
        return (this.operations.length === 0) ? new TextOperation()
            : this.seq.reduce((o1, o2) => this._compose(o1, o2));
    }

    getText() {
        if (this.operations.length === 0) return "";

        var composed = this.recompose();
        assert(composed.ops.length === 1 && composed.ops[0].type === 'insert');
        return composed.ops[0].text;
    }

    preadjust(index, incoming) {
        var acc = incoming.o, pindex = -1, residue;

        /* "Vertical" */
        if (incoming.p) {
            let [pid, pa] = incoming.p;
            pindex = this.operations.findIndex(e => e.id === pid);
            assert(pindex >= 0, 'parent operation is missing');
            let pel = this.operations[pindex];
            assert(pel.v.length > pa, 'parent operation is too new');
            for (let rev of pel.v.slice(pa + 1))
                acc = this._xform(rev.r, acc)[1];  /* [0] is ignored */
        
            residue = this.residues.get(pid);
            if (residue) {
                [residue, acc] = this._xform(residue, acc);
            }
        }

        /* "Horizontal" */
        for (let el of this.operations.slice(pindex + 1, index)) {
            let x = this._xform(this.applied.get(el.id), acc);
            residue = this._compose(residue, x[0]);
            acc = x[1];
        }
        return [residue, acc];
    }

    postadjust(index, incoming) {
        var acc = incoming;
        for (let el of this.operations.slice(index)) {
            let x = this._xform(acc, this.applied.get(el.id));
            this.residues.set(el.id, this._compose(this.residues.get(el.id), x[0]));
            this.applied.set(el.id, x[1]);
            acc = x[0];
        }
        return acc;
    }

    /**
     * Writes applied versions as new revisions of owned operations,
     * as long as such operations reside in a linear prefix.
     * @param {Set} opIds 
     */
    rebase(opIds=this.ownIds) {
        var lastId = undefined, revised = [];
        for (let [index, el] of this.operations.entries()) {
            if (opIds.has(el.id)) {
                let residue = this.residues.get(el.id);
                if (residue) {
                    let nextRev = {o:this.applied.get(el.id), p:lastId, r:residue};
                    el.v.push(nextRev);
                    this.residues.delete(el.id);
                    revised.push([index, nextRev]);
                }
            }

            let top = el.v.slice(-1)[0];
            if (!_.isEqual(top.p, lastId)) break; /* stops being linear */

            lastId = [el.id, el.v.length - 1];
        }

        return revised;
    }
    
    /**
     * Incorporates the results of rebases from other writers.
     */
    rebased(index, operation) {
        var incumbent = this.operations[index];
        assert.equal(incumbent.id, operation.id);
        assert.equal(JSON.stringify(incumbent.v),
                     JSON.stringify(operation.v.slice(0, incumbent.v.length)));

        this.operations[index] = operation;

        var [residue, adj] = this.preadjust(index, operation.v.slice(-1)[0]);
        this.residues.set(operation.id, residue);

        assert.equal(JSON.stringify(adj), JSON.stringify(this.applied.get(operation.id)));
    }

    isLinear() {
        var lastId = undefined;
        for (let el of this.operations) {
            let top = el.v.slice(-1)[0];
            if (!_.isEqual(top.p, lastId)) return false;
            lastId = [el.id, el.v.length - 1];
        }
        return true;
    }

    get raw() {
        return this.operations.map(el => el.v.slice(-1)[0].o);
    }
    get seq() {
        return this.operations.map(el => this.applied.get(el.id));
    }


    _xform(o1, o2) {
        return this._op(o1).transform(this._op(o2));
    }

    _compose(o1, o2) {
        if (!o1) return o2;
        if (!o2) return o1;
        return this._op(o1).compose(this._op(o2));
    }

    _op(o) {
        return (o instanceof TextOperation) ? o : TextOperation.fromJSON(o);
    }

    _byId(objs) {
        var d = new Map();
        for (let o of objs)
            d.set(o.id, o);
        return d;
    }


    /**
     * This is here for now as "specification" guidelines.
     * @param {*} operationTree 
     */
    _flatten(operationTree) {
        var flat = [], residues = []; //, acc = [];// operationTree.slice(0, 1);
        for (let el of operationTree) {
            /*
            var incoming = el.incoming;

            if (!incoming) {
                acc = this._xform(acc, el.o)[0];
            }
            */
            var pindex = flat.findIndex(e => e.id === el.p),
                residue = residues[pindex];
            if (residue) {
                let x = this._xform(residue, el.o);
                residue = x[0];
                console.log('residue', JSON.stringify(residue));
                el = {id: el.id, o: x[1], p: el.p};
            }
            for (let le of flat.slice(pindex + 1)) {
                let x = this._xform(le.o, el.o);
                residue = residue ? this._compose(residue, x[0]) : x[0];
                console.log('residue', JSON.stringify(residue));
                el = {id: el.id, o: x[1], p: le.id};
            }
            flat.push(el);
            residues.push(residue);
            /*
            if (incoming) {
                acc = this._compose(acc, el.o)
            }

            console.log(JSON.stringify(acc));
            */
        }
        return flat;
    }

}



module.exports = {FirepadTreeMerge};
