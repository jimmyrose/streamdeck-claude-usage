import streamDeck from "@elgato/streamdeck";
import { UsageDisplayAction } from "./actions/usage-display.js";

streamDeck.actions.registerAction(new UsageDisplayAction());
streamDeck.connect();
