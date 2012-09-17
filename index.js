var EventEmitter = require('events').EventEmitter
,fs = require('fs')
,path = require('path')
,zlib = require('zlib')
;


module.exports = function(config){

  config = config||{};
  // how often log files should be rotated
  config.interval = config.interval||1000*60*60*24;
  // how often to check for rotation
  config.pollInterval = config.pollInterval||60000;
  // default to gzipping output files.
  if(typeof config.gzip == 'undefined') config.gzip = true;

  var em = new EventEmitter()
  ,paused = false
  ,interval
  ;

  em.logs = {};
  em.addFile = function(p,data,cb){
    if(data && data.call) {
      cb = data;
      data = {};
    }
    
    fs.stat(p,function(err,stat){

      if(err) return cb(err);

      em.getRotateName(p,function(err,name){
        if(err) return cb(err);

        em.logs[p] = {
          stat:stat,
          data:data,
          rotateName:name
        };
        cb(null,em.logs[p]);

      });
    });
  };

  em.removeFile = function(p){
    if(em.logs[p]) {
      delete em.logs[p];
    }
  };

  em.pause = function(){
    paused = true;
  };

  em.resume = function(){
    paused = false;
  };

  em.stop = function(){
    em.stopped = true;
    clearInterval(interval);
  };

  em.rotate = function(){
    if(paused) return;
    Object.keys(this.logs).forEach(function(p){
      var data = em.logs[p];

      if(data && data.rotating) return;
      
      //
      //compare time!
      //
      var ctime = data.stat.ctime
      ,age = Date.now()-ctime.valueOf()
      ;

      if(age < config.interval) return;

      em.logs[p].rotating = true;
      var rs = fs.createReadStream(p);

      rs.pause();
      rs.on('close',function(){
        fs.unlink(p,function(){
          // create the file.
          fs.open(p,'w',parseInt('0655',8),function(err,fd){
            if(err) return em.emit('rotate-error',err,p);
            
            delete em.logs[p];

            em.addFile(p,data.data,function(err,data){
              if(err) return em.emit('rotate-error',err,p);

              em.emit('rotated',p,data);             
            });
          });
        });
      });

      rs.on('error',function(err){
        em.emit('rotate-error',err,p);
      });

      fs.stat(p,function(err,stat){
        // update stat for correct size value
        if(!err) data.stat = stat;
        em.emit('rotate',rs,path,data);

        process.nextTick(function(){
          rs.resume();
        });
      });

    });
  };

  em.formatTime = function(date){
    var month = ""+(date.getUTCMonth()+1);
    if(month.length == 1) month = '0'+month;
    return date.getUTCFullYear()+''+month+''+date.getUTCDate(); 
  };

  em.getRotateName = function(p,cb){
    var dir = path.dirname(p)
    , name = path.basename(p)
    ;

    this.getRotateId(p,function(err,id) {
      if(err) return cb(err);
      var toRotate = path.join(dir,em.formatTime(new Date())+(id?'-'+id:'')+'_'+name);
      cb(null,toRotate);
    }); 
  };

  em.getRotateId = function(p,cb){
    var base = path.basename(p),match;
    fs.readdir(path.dirname(p),function(err,data){
      if(err) return cb(err,0);

      var id = 0;
      data.forEach(function(f){

        var timestring = em.formatTime(new Date());
        if(~f.indexOf(base) && ~f.indexOf(timestring)){

          match = true;
          f = f.replace(timestring,'');

          var last = +(f.substr(0,f.indexOf('_')).replace(/[^\d]+/g,''));
          if(last && last >= id) id = last;
        }
      });
      
      if(match) ++id;
      cb(null,id);
    });
  };

  em.on('rotate',function(rs,p,data){
    // 
    // default rotator-tot
    //
    if(!data.stat.size) {
      // setting ctime to now so its not checked for one more whole interval
      data.stat.ctime = new Date();
      em.emit('rotate-empty',p,data);
      return;
    }

    var ws;
    if(config.gzip) {
      ws = zlib.createGzip().pipe(fs.createWriteStream(data.rotateName+'.gz'));
    } else {
      ws = fs.createWriteStream(data.rotateName);
    }
    rs.pipe(ws);
  });

  interval = setInterval(function(){
    em.rotate();
  },config.pollInterval);

  return em;
};


