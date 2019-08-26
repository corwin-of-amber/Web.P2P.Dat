const {FirepadTreeMerge} = require('../src/addons/firepad-conflow');

const s = JSON.stringify, assert = require('assert');



class SomeTests {

    simpleBefore() {
        var tm = new FirepadTreeMerge();
        this._batchDo(tm, [
            ["af"], [1,"d",1], [2,"e",1], [1,"::",3], ["-",6]
        ]);
        console.log(s(tm.seq), s(this._recompose(tm)));

        this._batchMerge(tm, [0,0], 1, [
            [1,"b",1], [2,"c",1]
        ]);
        console.log(s(tm.seq), s(this._recompose(tm)));

        return tm;
    }

    simpleAfter() {
        var tm = new FirepadTreeMerge();
        this._batchDo(tm, [
            ["af"], [1,"b",1], [2,"c",1], [1,"::",3], ["-",6]
        ]);
        console.log(s(tm.seq), s(this._recompose(tm)));

        this._batchMerge(tm, [0,0], 5, [
            [1,"d",1], [2,"e",1]
        ]);
        console.log(s(tm.seq), s(this._recompose(tm)));

        return tm;
    }

    simpleAlternate() {
        var tm = new FirepadTreeMerge();
        this._batchDo(tm, [
            ["a"], [1,"c"], [2,"e"]
        ]);
        console.log(s(tm.seq), s(this._recompose(tm)));

        this._batchMerge(tm, [0,0], 1, [
            [1,"b"], null, [2,"d"]
        ]);
        console.log(s(tm.seq), s(this._recompose(tm)));

        return tm;
    }

    simpleThreeway() {
        var tm = new FirepadTreeMerge();
        this._batchDo(tm, [
            ["a"], [1,"ce"], [3,"f"]
        ]);
        console.log(s(tm.seq), s(this._recompose(tm)));

        this._batchMerge(tm, [0,0], 1, [ [1,"b"] ]);    
        this._batchMerge(tm, [2,0], 3, [ [2,"d",1] ], 3);
        console.log(s(tm.seq), s(this._recompose(tm)));

        return tm;
    }

    rebaseBefore() {
        var tm = this.simpleBefore();
        console.log('residues>', s(this._residues(tm)));

        var revised = tm.rebase();

        console.log('revised>', s(revised));
        console.log(s(tm.raw), s(this._recompose(tm, tm.raw)));
        assert(tm.isLinear(), 'expected operations to be linear after rebase');
        assert(this._residues(tm).every(r => !r), 'expected no residues left');

        /* these are the expected revisions and residues */
        for (let [i,{o,r}] of [
            [3, {o:[3,"d",1],  r:[1,"bc",2]}],  [4, {o:[4,"e",1],  r:[1,"bc",3]}],
            [5, {o:[3,"::",3], r:[1,"bc",5]}],  [6, {o:["-",8],    r:[2,"bc",5]}]
        ]) {
            let rv = revised.find(e => e[0] == i)[1];
            assert.equal(s(o), s(rv.o));
            assert.equal(s(r), s(rv.r));
        }

        return tm;
    }

    rebaseAfter() {
        var tm = this.simpleAfter();
        console.log('residues>', s(this._residues(tm)));

        var state = s(tm);

        var revised = tm.rebase();
        /* should have no effect since out-of-order operations are not owned */
        assert.deepEqual(revised, []);
        assert.equal(s(tm), state);

        return tm;
    }

    rebasedAfter() {
        var tm = this.simpleAfter();

        tm.rebased(5, {id:1, v:[{p:[0,0], o:[1,"d",1]}, {p:[8,0], o:[6,"d",1], r:["-",1,"::bc",2]}]});
        tm.rebased(6, {id:3, v:[{p:[1,0], o:[2,"e",1]}, {p:[1,1], o:[7,"e",1], r:["-",1,"::bc",3]}]});

        console.log(s(tm.seq), s(this._recompose(tm)));
        assert(tm.isLinear(), 'expected operations to be linear after rebase');
        assert(this._residues(tm).every(r => !r), 'expected no residues left');
        assert.equal(s(tm.seq), s(tm.raw));

        return tm;
    }

    rebasedAfterAndPush() {
        var tm = this.rebasedAfter();

        this._batchDo(tm, [ [9,'<gh>'] ], 10);
        console.log(s(tm.seq), s(this._recompose(tm)));

        return tm;
    }

    rebasedAfterAndMerge() {
        var tm = this.rebasedAfter();

        /* a stale change based on [2,"e",1] */
        this._batchMerge(tm, [3,0], 7, [ [4,'<gh>'] ], 5);
        console.log(s(tm.seq), s(this._recompose(tm)));
    }

    _batchDo(tm, ops, startId=0) {
        var id = startId;
        for (let op of ops) {
            tm.push(tm.newOperation(op, id));
            id += 2;
        }
    }

    _batchMerge(tm, root, index, ops, startId=1) {
        var p = root, id = startId;
        for (let op of ops) {
            if (op) {
                tm.insert(index, {id, v:[{p, o:op}]});
                p = [id, 0];
                id += 2;
            }
            index++;
        }
    }

    _recompose(tm, seq=tm.seq) {
        return seq.reduce((x,y) => tm._compose(x,y));
    }

    _residues(tm) {
        return tm.operations.map(e => tm.residues.get(e.id));
    }

}



if (typeof module !== 'undefined' && module.id == '.') {
    var st = new SomeTests();
    st.rebaseAfter();

    // TODO organize tests in a suite
}