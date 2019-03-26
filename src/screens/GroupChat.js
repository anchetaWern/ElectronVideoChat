import React, { Component } from "react";
import { Container, Row, Col, Button, Form, Figure } from "react-bootstrap";
import { Player, ControlBar } from "video-react";
import { Scrollbars } from "react-custom-scrollbars";

import Peer from "simple-peer";
import { ChatManager, TokenProvider } from '@pusher/chatkit-client';
import axios from "axios";
import Masonry from "react-masonry-component";
import Dropzone from "react-dropzone";

const BASE_URL = "https://electron-videochat-authserver-gqxyymxnrs.now.sh";

const CHATKIT_TOKEN_PROVIDER_ENDPOINT = "YOUR CHATKIT TEST TOKEN PROVIDER URL";
const CHATKIT_INSTANCE_LOCATOR = process.env.REACT_APP_CHATKIT_INSTANCE_ID;

class GroupChatScreen extends Component {
  state = {
    is_initialized: true,
    streams: [],
    messages: [],
    show_load_earlier: false,
    is_sending: false,
    files: []
  };

  constructor(props) {
    super();
    this.users = [];
    this.user_channels = [];
    this.peers = [];
    this.is_initiator = false;
    this.peer_username = null;
    this.has_own_stream = false;
  }

  _connectToPeer = (username, stream = false) => {
    const peer_options = {
      initiator: this.is_initiator,
      trickle: false,

      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478?transport=udp" }
        ]
      }
    };

    if (stream) {
      peer_options.stream = stream;
    }

    const p = new Peer(peer_options);

    this.peers.push({
      username: username,
      peer: p
    });

    p.on("error", err => {
      console.log("peer error: ", err);
    });

    p.on("signal", data => {
      if (this.is_initiator && data) {
        console.log("(4) user A receives signal");
        this.signal = JSON.stringify(data);
      } else {
        console.log("(8) user B generates an answer");

        const peer = this.user_channels.find(ch => {
          return ch.username === this.peer_username;
        });
        if (peer) {
          console.log(
            "(9) user B triggers event (client-peer-data) containing the answer to user A"
          );

          peer.channel.trigger("client-peer-data", {
            username: this.username,
            peer_data: JSON.stringify(data)
          });
        }
      }
    });

    p.on("connect", () => {
      console.log(`(10) ${this.username} is connected`);

      this.users.shift();

      if (this.users.length) {
        this._initializePeerConnection(this.users[0]);
      }
    });

    p.on("stream", stream => {
      console.log(`${this.username} received stream`);
      const peer_video_stream = window.URL.createObjectURL(stream);

      this.setState(prevState => ({
        streams: [...prevState.streams, peer_video_stream]
      }));
    });
  };

  _createPeer = username => {
    navigator.getUserMedia(
      { video: true, audio: true },
      stream => {
        const video_stream = window.URL.createObjectURL(stream);

        if (!this.has_own_stream) {
          this.setState(prevState => ({
            streams: [...prevState.streams, video_stream]
          }));
          this.has_own_stream = true;
        }

        console.log(`${this.username} is connecting to remote peer...`);
        this._connectToPeer(username, stream);
      },
      err => {
        console.log("error occured getting media: ", err);
      }
    );
  };

  async componentDidMount() {
    const { navigation } = this.props;
    this.user_id = navigation.getParam("user_id");
    this.username = navigation.getParam("username");
    this.channel = navigation.getParam("channel");
    this.pusher = navigation.getParam("pusher");
    this.my_channel = navigation.getParam("my_channel");
    this.room_id = navigation.getParam("room_id").toString();

    try {
      const response_data = await axios.post(`${BASE_URL}/users`, {
        channel: this.channel,
        username: this.username
      });

      this.users = response_data.data.users;
      if (this.users.length) {
        this._initializePeerConnection(this.users[0]);
      }
    } catch (err) {
      console.log("error getting users: ", err);
    }

    const chatManager = new ChatManager({
      instanceLocator: CHATKIT_INSTANCE_LOCATOR,
      userId: this.user_id,
      tokenProvider: new TokenProvider({ url: CHATKIT_TOKEN_PROVIDER_ENDPOINT })
    });

    try {
      this.currentUser = await chatManager.connect();
      await this.currentUser.subscribeToRoom({
        roomId: this.room_id,
        hooks: {
          onMessage: this._onReceive
        },
        messageLimit: 10
      });
    } catch (err) {
      console.log("cannot connect user to chatkit: ", err);
    }

    // (3) user A receives event (client-initiate-signaling) from user B and setups peer connection
    this.my_channel.bind("client-initiate-signaling", data => {
      console.log(
        "(3) user A receives event (client-initiate-signaling) from user B and setups peer connection"
      );
      this.is_initiator = true; // whoever receives the client-initiate-signaling is the initiator
      this._createPeer(data.username);

      this.initiator_channel = this.pusher.subscribe(
        `private-user-${data.username}`
      );

      this.initiator_channel.bind("pusher:subscription_error", () => {
        console.log(`error subscribing to signaling user ${data.username}`);
      });

      this.initiator_channel.bind("pusher:subscription_succeeded", () => {
        setTimeout(() => {
          if (this.signal) {
            // (5) user A triggers event (client-peer-data) containing their signal to user B
            console.log(
              "(5) user A triggers event (client-peer-data) containing their signal to user B: ",
              this.signal
            );
            this.initiator_channel.trigger("client-peer-data", {
              username: this.username,
              peer_data: this.signal
            });
          } else {
            console.log("There's no signal");
          }
        }, 5000);
      });
    });

    this.my_channel.bind("client-peer-data", data => {
      if (!this.is_initiator) {
        console.log("(6) user B receives the event (client-peer-data)");
        console.log(
          "(7) user B throws back the signal to user A via peer signaling (peer.signal)"
        );
      } else {
        console.log(
          "(10) user A receives the event (client-peer-data) and throws back the signal to user B via peer signaling (peer.signal)"
        );
      }

      const user = this.peers.find(item => {
        return item.username === data.username;
      });
      if (user && data) {
        console.log("now sending data via peer signaling: ", data);
        user.peer.signal(JSON.parse(data.peer_data));
      } else {
        console.log("cant find user / no data");
      }
    });

    this.setState({
      is_initialized: true
    });
  }

  _initializePeerConnection = username => {
    const channel = this.pusher.subscribe(`private-user-${username}`);
    this.user_channels.push({
      username,
      channel
    });

    channel.bind("pusher:subscription_error", status => {
      console.log("error subscribing to peer channel: ", status);
    });

    channel.bind("pusher:subscription_succeeded", () => {
      console.log("(1) user B setups peer connection (non initiator)");
      this.is_initiator = false;
      this._createPeer(username); // this is always the non-initiator
      this.peer_username = username;

      console.log(
        "(2) user B triggers event (client-initiate-signaling) to user A"
      );

      setTimeout(() => {
        channel.trigger("client-initiate-signaling", {
          username: this.username
        });
      }, 5000);
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

  _onFileDrop = files => {
    this.setState({ files });
  };

  _onFileCancel = () => {
    this.setState({
      files: []
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

            <Col md={4} className="ChatContainer">
              <Row>
                <Col className="Messages">
                  <Scrollbars
                    style={{ height: 580, width: 440 }}
                    ref={c => {
                      this.scrollComponent = c;
                    }}
                    autoHide={true}
                  >
                    {this.state.show_load_earlier && (
                      <Button
                        variant="link"
                        className="SmallText"
                        onClick={this._loadEarlierMessages}
                        disabled={this.state.is_loading}
                        block
                      >
                        {this.state.is_loading
                          ? "Loading..."
                          : "Load earlier messages"}
                      </Button>
                    )}

                    <div className="MessageBoxes">{this._renderMessages()}</div>
                  </Scrollbars>
                </Col>
              </Row>

              <Row>
                <Col>
                  <Form className="ChatForm">
                    <Dropzone
                      onDrop={this._onFileDrop}
                      onFileDialogCancel={this._onFileCancel}
                    >
                      {({ getRootProps, getInputProps }) => (
                        <div {...getRootProps()}>
                          <input {...getInputProps()} />
                          <span className="SmallText">
                            {this.state.files.length
                              ? "File selected"
                              : "Select file"}
                          </span>
                        </div>
                      )}
                    </Dropzone>

                    <Form.Group>
                      <Form.Control
                        as="textarea"
                        rows="2"
                        className="TextArea"
                        onChange={this._updateMessage}
                        value={this.state.message}
                      />
                    </Form.Group>

                    <Button
                      variant="primary"
                      onClick={this._sendMessage}
                      disabled={this.state.is_sending}
                      block
                    >
                      {this.state.is_sending ? "Sending…" : "Send"}
                    </Button>
                  </Form>
                </Col>
              </Row>
            </Col>
          </Row>
        )}
      </Container>
    );
  }

  //

  _renderMessageBox = msg => {
    if (msg.user._id === this.user_id) {
      return (
        <div className="MessageRow Me">
          <div
            className="ChatBubble"
            dangerouslySetInnerHTML={{ __html: msg.text }}
            onClick={msg._downloadFile}
          />

          <div className="ChatAvatar">
            <Figure>
              <Figure.Image
                width={30}
                height={30}
                src={msg.user.avatar}
                thumbnail
                roundedCircle
              />
            </Figure>
            <div className="username">{msg.user.name}</div>
          </div>
        </div>
      );
    }

    //

    return (
      <div className="MessageRow">
        <div className="ChatAvatar">
          <Figure>
            <Figure.Image
              width={30}
              height={30}
              src={msg.user.avatar}
              thumbnail
              roundedCircle
            />
          </Figure>
          <div className="username">{msg.user.name}</div>
        </div>

        <div
          className="ChatBubble"
          dangerouslySetInnerHTML={{ __html: msg.text }}
          onClick={msg._downloadFile}
        />
      </div>
    );
  };

  _renderMessages = () => {
    return this.state.messages.map(msg => {
      return this._renderMessageBox(msg);
    });
  };

  _onReceive = async data => {
    let { message } = await this.getMessageAndFile(data);

    await this.setState(prevState => ({
      messages: [...prevState.messages, message]
    }));

    if (this.state.messages.length > 4) {
      this.setState({
        show_load_earlier: true
      });
    }

    setTimeout(() => {
      this.scrollComponent.scrollToBottom();
    }, 1000);
  };

  getMessageAndFile = async ({
    id,
    senderId,
    sender,
    text,
    attachment,
    createdAt
  }) => {
    let msg_data = {
      _id: id,
      text: text,
      createdAt: new Date(createdAt),
      user: {
        _id: senderId,
        name: sender.name,
        avatar:
          "https://cdn.pixabay.com/photo/2016/08/08/09/17/avatar-1577909_960_720.png"
      }
    };

    if (attachment) {
      const { link, name } = attachment;

      msg_data.text += `<br/>attached:<br/><span class="link">${name}</a>`;
      msg_data._downloadFile = async () => {
        window.ipcRenderer.send("download-file", link);
      };
    }

    return {
      message: msg_data
    };
  };

  _loadEarlierMessages = async () => {
    this.setState({
      is_loading: true
    });

    const earliest_message_id = Math.min(
      ...this.state.messages.map(m => parseInt(m._id))
    );

    try {
      let messages = await this.currentUser.fetchMessages({
        roomId: this.room_id,
        initialId: earliest_message_id,
        direction: "older",
        limit: 10
      });

      if (!messages.length) {
        this.setState({
          show_load_earlier: false
        });
      }

      let earlier_messages = [];

      await this.asyncForEach(messages, async msg => {
        let { message } = await this.getMessageAndFile(msg);
        earlier_messages.push(message);
      });

      await this.setState(prevState => ({
        messages: [...earlier_messages, ...prevState.messages]
      }));
    } catch (err) {
      console.log("error occured while trying to load older messages", err);
    }

    await this.setState({
      is_loading: false
    });
  };

  asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  };

  _updateMessage = evt => {
    this.setState({
      message: evt.target.value
    });
  };

  _sendMessage = async () => {
    let msg = {
      text: this.state.message,
      roomId: this.room_id
    };

    this.setState({
      is_sending: true
    });

    if (this.state.files.length > 0) {
      const file = this.state.files[0];
      const filename = file.name;

      msg.attachment = {
        file: file,
        name: `${filename}`,
        type: "file"
      };
    }

    try {
      await this.currentUser.sendMessage(msg);
      this.setState({
        is_sending: false,
        message: "",
        files: []
      });
    } catch (err) {
      console.log("error sending message: ", err);
    }
  };
}

export default GroupChatScreen;
