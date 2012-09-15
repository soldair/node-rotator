var test = require('tap').test
,rotater = require(__dirname+'/../index.js')
;

test('can make rotater',function(t){
    var tot = rotater();
    t.ok(tot,'should have returned an emitter');
    tot.stop();
    t.end();
});

