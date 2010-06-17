var sys = require("sys"),
    readFile = require("fs").readFile,
    ws = require('./deps/node-websocket-server/lib/ws');

var HOST = "localhost",
    PORT = 8888,
    DEBUG = true,
    CLIENT_FILE = "client.html";

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
    sys.puts( "<"+conn._id+"> "+message );
    // TODO: validate feed uri
    // TODO: send subscription request
    sys.puts( "<"+conn._id+"> Subscribing to "+message );
    server.send( conn._id, "Subscribing to "+message )
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