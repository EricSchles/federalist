var fs = require('fs'),
    zlib = require('zlib'),
    mime = require('mime'),
    AWS = require('aws-sdk'),
    S3 = require('s3'),
    s3 = new AWS.S3({ params: {
      Bucket: sails.config.build.s3Bucket
    } }),
    s3Ext = S3.createClient( {
      s3Client: s3
    });

module.exports = function(config, done) {

  config.compress = 'html|css|js|json';

  // Loop through all files and selectively encode them
  walk(config.directory, function(err, results) {
    if (err) return done(err);

    async.each(results, encode.bind(this, config), function(err) {
      if (err) return done(err);

      // After encoding, sync to S3
      sync(config, done);
    });
  });

};

function encode(config, file, done) {
  var contentType = mime.lookup(file),
      ext = mime.extension(contentType),
      match = new RegExp(config.compress);

  if (!match.test(ext)) return done();

  fs.readFile(file, function(err, data) {
    if (err) return done(err);
    zlib.gzip(data, function(err, data) {
      if (err) return done(err);
      fs.writeFile(file, data, done);
    });
  });
}

function sync(config, done) {
  var params = {
        localDir: config.directory,
        deleteRemoved: true,
        s3Params: {
          Prefix: config.prefix || '',
          CacheControl: 'max-age=60'
        },
        getS3Params: setEncoding
      },
      uploader = s3Ext.uploadDir(params).on('error', function(err) {
        sails.log.error('unable to sync:', err.stack);
        done(err);
      }).on('end', function() {
        done();
      });

  function setEncoding(file, stat, done) {
    var s3Params = {},
        contentType = mime.lookup(file),
        ext = mime.extension(contentType),
        match = new RegExp(config.compress);
    if (match.test(ext)) s3Params.ContentEncoding = 'gzip';
    sails.log.verbose('syncing file: ', file);
    done(null, s3Params);
  }
}

function walk(dir, done) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function(file) {
      file = dir + '/' + file;
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
}