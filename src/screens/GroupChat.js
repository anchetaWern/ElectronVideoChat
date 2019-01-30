import React, { Component } from "react";
import { Container, Row, Col } from "react-bootstrap";
import { Player, ControlBar } from "video-react";

import Peer from "simple-peer";
import axios from "axios";
import Masonry from "react-masonry-component";

const BASE_URL = "YOUR NGROK HTTPS URL";

class GroupChatScreen extends Component {
  state = {
    is_initialized: false,
    streams: []
  };

  constructor(props) {
    super();
    this.initiator_signal = null;
    this.users = [];
    this.user_channels = [];
  }

  async componentDidMount() {
    const { navigation } = this.props;
    this.username = navigation.getParam("username");
    this.channel = navigation.getParam("channel");
    this.is_initiator = navigation.getParam("is_initiator");
    this.pusher = navigation.getParam("pusher");
    this.my_channel = navigation.getParam("my_channel");

    try {
      const response_data = await axios.post(`${BASE_URL}/users`, {
        channel: this.channel,
        username: this.username
      });

      this.users = response_data.data.users;
      if (this.users.length) {
        for (const index in this.users) {
          const username = this.users[index];

          const channel = this.pusher.subscribe(`private-user-${username}`);
          this.user_channels.push({
            username,
            channel
          });
          channel.bind("pusher:subscription_error", status => {
            console.log("error subscribing to peer channel: ", status);
          });
          channel.bind("pusher:subscription_succeeded", () => {
            console.log(`subscribed to ${username}'s channel`);
            channel.trigger("client-initiate-signaling", {
              initiate: true,
              username: this.username
            });
          });
        }
      }
    } catch (err) {
      console.log("error getting users: ", err);
    }

    this.my_channel.bind("client-initiate-signaling", data => {
      this.signaling_user_channel = this.pusher.subscribe(
        `private-user-${data.username}`
      );

      this.signaling_user_channel.bind("pusher:subscription_error", () => {
        console.log(`error subscribing to signaling user ${data.username}`);
      });

      this.signaling_user_channel.bind("pusher:subscription_succeeded", () => {
        console.log(`subscribed to signaling user ${data.username}`);
        this.signaling_user_channel.trigger("client-peer-data", {
          username: this.username,
          peer_data: this.initiator_signal
        });
      });
    });

    this.my_channel.bind("client-peer-data", data => {
      this.current_peer_username = data.username;
      this.peer.signal(JSON.parse(data.peer_data));
    });

    navigator.getUserMedia(
      { video: true, audio: true },
      stream => {
        const video_stream = window.URL.createObjectURL(stream);
        this.setState(prevState => ({
          streams: [...prevState.streams, video_stream]
        }));
        this._connectToPeer(stream);
      },
      err => {
        console.log("error occured getting media: ", err);
      }
    );
  }

  _connectToPeer = (stream = null) => {
    const peer_options = { initiator: this.is_initiator, trickle: false };
    if (stream) {
      peer_options.stream = stream;
    }

    this.peer = new Peer(peer_options);
    this.peer.on("error", err => {
      console.log("peer error: ", err);
    });

    this.peer.on("signal", data => {
      this.initiator_signal = JSON.stringify(data);
      if (this.current_peer_username) {
        const initiator = this.user_channels.find(user => {
          return user.username == this.current_peer_username;
        });

        initiator.channel.trigger("client-peer-data", {
          username: this.username,
          peer_data: this.initiator_signal
        });
      }
    });

    this.peer.on("connect", () => {
      console.log(`${this.username} is connected`);
      this.setState({
        is_initialized: true
      });
    });

    this.peer.on("stream", receivedStream => {
      console.log(`${this.username} received stream`);
      const peer_video_stream = window.URL.createObjectURL(receivedStream);

      this.setState(prevState => ({
        streams: [...prevState.streams, peer_video_stream]
      }));
    });
  };

  _renderStreams = () => {
    return this.state.streams.map(video => {
      return (
        <div className="VideoBox">
          <Player autoPlay={true} src={video}>
            <ControlBar autoHide={false} disableDefaultControls />
          </Player>
        </div>
      );
    });
  };

  render() {
    return (
      <Container fluid={true}>
        <Row className="Header justify-content-md-center">
          <Col md="4">
            <h3>{this.channel}</h3>
          </Col>
        </Row>

        {!this.state.is_initialized && <div className="loader">Loading...</div>}

        {this.state.is_initialized && (
          <Row>
            <Col md={8} className="VideoContainer">
              <Masonry
                disableImagesLoaded={false}
                updateOnEachImageLoad={false}
              >
                {this._renderStreams()}
              </Masonry>
            </Col>
          </Row>
        )}
      </Container>
    );
  }
}

export default GroupChatScreen;
