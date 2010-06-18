var http = require("http"),
    sys = require("sys"),
    querystring = require("querystring"),
    url = require("url"),
    readFile = require("fs").readFile,
    ws = require('./deps/node-websocket-server/lib/ws');

var HOST = "localhost",
    PORT = 8888,
    DEBUG = true,
    CLIENT_FILE = "client.html",
    HUB = "http://superfeedr.com/hubbub";

var Subscription = function( callbackUri, feed ) {
  this.mode = "subscribe";
  this.verify = "async";
  this.callback = callbackUri;
  this.topic = feed;

  var params = {
    "hub.mode" : this.mode,
    "hub.verify" : this.verify,
    "hub.callback" : this.callback,
    "hub.topic" : this.topic
  };

  this.qs = function() {
    var search = querystring.stringify( params );
    sys.puts( "Subscription POST Params: "+search );
    return search;
  }
}

// Server --------------------------------------
var server = ws.createServer({ debug: DEBUG });

server.addListener("listening", function() {
  sys.puts("Listening for connections at ws://" + HOST + ':' + PORT);
});

// Handle Web Socket Requests
server.addListener("connection", function( conn ) {

  sys.puts( "<"+conn._id+"> connected." );
  server.send( conn._id, "Awaiting feed subscription request." );

  conn.addListener("message", function( message ) {
    var wsid = conn._id;
    sys.puts( "<"+wsid+"> "+message );
    // TODO: validate feed uri
    sys.puts( "<"+wsid+"> Subscribing to "+message );
    server.send( wsid, "Subscribing to "+message+"." )

    // Send subscription request to hub.
    var callbackUri = "http://dshaw.com/wsclients/"+wsid+"/",
        sub = new Subscription( callbackUri, message ),
        qs = sub.qs(),
        subUrl = HUB +"?"+ qs;
        hub = url.parse( subUrl ),
        contentLength = qs.length;

    sys.puts( "content-length: "+contentLength );
    sys.puts( "POST "+subUrl );

    var client = http.createClient( hub.port || 80, hub.hostname );
    var request = client.request("POST", hub.pathname + (hub.search || ""),
            {
              "host": hub.hostname,
              "Content-Length": contentLength
            }); // , "Content-Length": contentLength

    request.addListener("response", function(response) {
      sys.puts('STATUS: ' + response.statusCode);
      sys.puts('HEADERS: ' + JSON.stringify(response.headers));
      response.setEncoding('utf8');
      response.addListener("data", function(chunk) {
        sys.puts(chunk);
      });
    });
    
    request.end();
  });

});

server.addListener("close", function( conn ) {
  sys.puts( "<"+conn._id+"> closed connection." );
});

// Handle HTTP Requests
server.addListener("request", function( req, res ) {

  var filename = CLIENT_FILE,
      headers,
      body,

      loadResponseData = function( callback ) {
        if (body && headers) {
          callback();
          return;
        }
        readFile( filename, function (err, data) {
          if (err) {
            sys.puts("Error loading " + filename);
          } else {
            body = data;
            headers = {
              "Content-Type": 'text/html',
              "Content-Length": body.length
            };
            callback();
          }
        });
      };

  loadResponseData(function () {
    res.writeHead(200, headers);
    res.end(body);
  });
});

server.listen(PORT, HOST);