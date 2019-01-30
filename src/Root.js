import React, { Component } from "react";
import { createSwitchNavigator } from "@react-navigation/core";
import { createBrowserApp } from "@react-navigation/web";

import LoginScreen from "./screens/Login";
import GroupChatScreen from "./screens/GroupChat";


const RootNavigator = createSwitchNavigator(
  {
    Login: LoginScreen,
    GroupChat: GroupChatScreen
  },
  {
    initialRouteName: "Login"
  }
);

const App = createBrowserApp(RootNavigator);



class Router extends Component {
  render() {
    return <App />
  }
}

export default Router;