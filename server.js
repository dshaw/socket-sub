var http = require("http"),
    sys = require("sys"),
    querystring = require("querystring"),
    url = require("url"),
    readFile = require("fs").readFile,
    base64 = require("./deps/base64"),
    ws = require('./deps/node-websocket-server/lib/ws');

var HOST = "localhost",
    PORT = 8888,
    DEBUG = true,
    CLIENT_FILE = "client.html",
    USERNAME = "username",
    PASSWORD = "password",
    HUB = "http://superfeedr.com/hubbub";

var percentEncode = function( str ) {
  return encodeURI( str )
      .replace(/\!/g, "%21")
      .replace(/\'/g, "%27")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
      .replace(/\*/g, "%2A")
      .replace(/\./g, "%2E");
};

var Subscription = function( callbackUri, feed ) {
  this.mode = "subscribe";
  this.verify = "async";
  this.callback = callbackUri;
  this.topic = feed;

  var params = {
    "hub.mode" : this.mode,
    "hub.verify" : this.verify,
    "hub.callback" : this.callback,
    "hub.topic" : this.topic.replace(/"/g, "")
  };

  this.data = function() {
    return percentEncode( querystring.stringify( params ) );
  }
}

// Thank you MDC.
function fixedEncodeURIComponent (str) {
  return encodeURIComponent(str).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').
                                 replace(/\)/g, '%29').replace(/\*/g, '%2A');
}


// Server --------------------------------------
var server = ws.createServer({ debug: DEBUG });

server.addListener("listening", function() {
  sys.puts("Listening for connections at ws://" + HOST + ':' + PORT);
});

// Handle Web Socket Requests
server.addListener("connection", function( conn ) {

  sys.puts( "<"+conn._id+"> connected" );
  server.send( conn._id, "Awaiting feed subscription request" );

  conn.addListener("message", function( message ) {
    var wsid = conn._id;
    sys.puts( "<"+wsid+"> "+message );
    // TODO: validate feed uri
    sys.puts( "<"+wsid+"> Subscribing to "+message );
    server.send( wsid, "Subscribing to "+message )

    // Send subscription request to hub.
    var callbackUri = "http://dshaw.com/wsclients/"+wsid+"/",
        sub = new Subscription( callbackUri, message ),
        body = sub.data(),
        hub = url.parse( HUB ),
        contentLength = body.length,
        headers = {
          "Accept": '*/*',
          "Authorization": "Basic "+base64.encode(USERNAME + ":" + PASSWORD),
          "Content-Length": contentLength,
          "Content-Type": "application/x-www-form-urlencoded",
          "Host": hub.hostname,
          "User-Agent": "Socket-Sub for Node.js"
        };

    var client = http.createClient( hub.port || 80, hub.hostname );
    var request = client.request("POST", hub.pathname + (hub.search || ""), headers);

    request.write(body, 'utf8');

    //    for (var p in request) {
    //      if (typeof request[p] !== "function") {
    //        sys.puts( p+": "+request[p] );
    //      }
    //    }
    sys.puts("");
    sys.puts("REQUEST");
    sys.print(request._header);
    sys.puts(body);

    request.addListener("response", function(response) {
      var body = "";

      response.addListener("data", function(chunk) {
        body += chunk;
      });

      response.addListener('end', function() {
        sys.puts("");
        sys.puts("RESPONSE");
        sys.puts("STATUS: "+response.statusCode);
        sys.puts("HEADERS: "+JSON.stringify(response.headers));
        sys.puts("BODY: "+body);
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