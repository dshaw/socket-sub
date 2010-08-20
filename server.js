var fs = require("fs"),
    http = require("http"),
    sys = require("sys"),
    querystring = require("querystring"),
    url = require("url"),
    base64 = require("./deps/base64"),
    ws = require('./deps/node-websocket-server/lib/ws');

var config = JSON.parse( fs.readFileSync("./config.json", "utf8") ) || {};

// To configure this application, edit "config.json".
var HOST = config.host || null, // localhost
    PORT = config.port || 27261,
    HUB = config.hub || "http://superfeedr.com/hubbub",
    USERNAME = config.username || "username",
    PASSWORD = config.password || "password",
    CLIENT = config.client || "client.html",
    DEBUG = config.password || false;

var printRequest = function(request, body) {
  sys.puts("");
  sys.puts("REQUEST");
  sys.print(request._header);
  sys.puts(body);
};

var printResponse = function(response, body) {
  sys.puts("");
  sys.puts("RESPONSE");
  sys.puts("STATUS: "+response.statusCode);
  sys.puts("HEADERS: "+JSON.stringify(response.headers));
  sys.puts("BODY: "+body);
};

var Subscription = function( callbackUri, feed ) {
  
  this.mode = "subscribe";
  this.verify = "sync";
  this.callback = callbackUri;
  this.topic = this.id = feed; // TODO: convert id into a hash of the feed url.

  var params = {
    "hub.mode" : this.mode,
    "hub.verify" : this.verify,
    "hub.callback" : this.callback,
    "hub.topic" : this.topic //.replace(/"/g, "")
  };

  this.data = function() {
    return querystring.stringify( params ) ; 
  }
};

var SubscriptionManager = function() {
  this.subscribers = {};

  this.connect = function(id) {
    if (!this.subscribers[id]) {
      this.subscribers[id] = {
        subscriptions : {}
      };
    }
  }

  this.disconnect = function(id) {
    delete this.subscribers[id];
  }

  this.subscribe = function(id, subscription) {
    if (!this.subscribers[id].subscriptions[subscription.id]) {
      this.subscribers[id].subscriptions[subscription.id] = subscription;
    }
  }
};

var requestHandler = function( req, res ) {

  var handle,
      id,
      uri = url.parse( req.url ),
      path = (uri.pathname.substring(1)).split("/"),
      simpleHeader = function(body) {
        return {
          "Content-Type": 'text/html',
          "Content-Length": body.length
        }
      }
      requestMap = {
        404 : function ( req, res ) {
          body = "File not found"
          headers = simpleHeader(body);
          res.sendHeader(404, headers);
          res.write(body);
          res.close();
        },
        index : function( req, res ) {
          var body,
              headers,

              loadResponseData = function( callback ) {
                if (body && headers) {
                  callback();
                  return;
                }
                fs.readFile( CLIENT, function (err, data) {
                  if (err) {
                    sys.puts("Error loading " + filename);
                  } else {
                    body = data;
                    headers = simpleHeader(body);
                    callback();
                  }
                });
              };

          loadResponseData(function () {
            res.writeHead(200, headers);
            res.end(body);
          });
        },
        wsclient : function ( req, res, id ) {
          switch(req.method) {
            case "GET":
              body = id,
              headers = simpleHeader(body);
              res.sendHeader(200, headers);
              res.write(body);
              res.close();
              break;
            case "POST":
              var data = "", hub = this;
              req.addListener("data", function(chunk) {
                  data += chunk;
              });
              req.addListener("end", function() {
                  var params = qs.parse(data);
                  if("hub.mode" in params &&
                     ~["publish",
                       "subscribe",
                       "unsubscribe"].indexOf(params["hub.mode"])) {
                      hub["do_"+params["hub.mode"]](req, res, params);
                  } else {
                      hub["400"](req, res, "Unknown hub.mode parameter");
                  }
              });
              break;
          }
        }
      };

  if (path.length === 0 || path === "client.html") {
    handle = "index";
  } else if ( path[0] === "wsclients" ) {
    if ( !!path[1] && !isNaN(parseInt(path[1], 10)) ) {
      handle = "wsclients";
      id = path[1];
    } else {
      handle = "404";
    }
  } else if ( !(path in requestMap) && !isNaN(parseInt(path, 10)) ) {
    handle = "404";
  } else {
    req.setBodyEncoding("utf-8");
    requestMap[handle]( req, res, id );
  }
};


var subMan = new SubscriptionManager(); // connection manager


// Server --------------------------------------
var server = ws.createServer({ debug: DEBUG });

server.addListener("listening", function() {
  var hostInfo = (HOST || "localhost") + ":" + PORT.toString();
  sys.puts("Server at http://" + hostInfo + "/");
  sys.puts("Listening for connections at ws://" + hostInfo);
});

// Handle Web Socket Requests
server.addListener("connection", function( conn ) {

  subMan.connect( conn._id );
  sys.puts( "<"+conn._id+"> connected" );
  server.send( conn._id, "Awaiting feed subscription request" );

  conn.addListener("message", function( message ) {
    var wsid = conn._id;
    sys.puts( "<"+wsid+"> "+message );
    // TODO: validate feed uri
    sys.puts( "<"+wsid+"> Subscribing to "+message );
    server.send( wsid, "Subscribing to "+message );

    // Send subscription request to hub.
    var callbackUri = "http://"+(HOST || "localhost")+":"+PORT+"/wsclients/"+wsid+"/",
        sub = new Subscription( callbackUri, message),
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

    if ( (url.parse( callbackUri )).hostname === "localhost" ) {
      var warning = "WARNING: PubSubHubbub subscriber cannot run from localhost.";
      sys.puts(warning);
      server.send( wsid, warning );
    }

    var client = http.createClient( hub.port || 80, hub.hostname );
    var request = client.request("POST", hub.pathname + (hub.search || ""), headers);

    request.write(body, 'utf8');

    //    for (var p in request) {
    //      if (typeof request[p] !== "function") {
    //        sys.puts( p+": "+request[p] );
    //      }
    //    }
    if (DEBUG) printRequest( request, body );

    request.addListener("response", function(response) {
      var body = "";

      response.addListener("data", function(chunk) {
        body += chunk;
      });

      response.addListener('end', function() {
        subMan.subscribe(conn._id, sub);
        if (DEBUG) printResponse( response, body );
      });
    });

    request.end();
  });

});

server.addListener("close", function( conn ) {
  subMan.disconnect( conn._id );
  sys.puts( "<"+conn._id+"> closed connection." );
});

// Handle HTTP Requests
server.addListener("request", requestHandler);

server.listen(PORT, HOST);