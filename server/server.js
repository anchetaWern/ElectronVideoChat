var express = require("express");
var bodyParser = require("body-parser");
var Pusher = require("pusher");
const cors = require("cors");

require("dotenv").config();

var channels = [];

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

var pusher = new Pusher({
  appId: process.env.APP_ID,
  key: process.env.APP_KEY,
  secret: process.env.APP_SECRET,
  cluster: process.env.APP_CLUSTER
});

app.get("/", (req, res) => {
  res.send("all is well...");
});

app.post("/pusher/auth", (req, res) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;
  console.log("authing...");
  var auth = pusher.authenticate(socketId, channel);
  return res.send(auth);
});

app.post("/login", async (req, res) => {
  const { channel, username } = req.body;

  var channel_index = channels.findIndex(c => c.name == channel);
  if (channel_index == -1) {
    console.log("channel not yet created, so creating one now...");

    channels.push({
      name: channel,
      users: [username]
    });

    return res.json({
      is_initiator: true
    });
  } else {
    if (channels[channel_index].users.indexOf(username) == -1) {
      console.log("channel created, so pushing user...");
      channels[channel_index].users.push(username);

      return res.json({
        is_initiator: false
      });
    }
  }

  return res.status(500).send("invalid user");
});

app.post("/users", (req, res) => {
  const { channel, username } = req.body;
  const channel_data = channels.find(ch => {
    return ch.name == channel;
  });

  let channel_users = [];
  if (channel_data) {
    channel_users = channel_data.users.filter(user => {
      return user != username;
    });
  }

  return res.json({
    users: channel_users
  });
});

var port = process.env.PORT || 5000;
app.listen(port);
