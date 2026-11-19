import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { qdayAevum } from "./lib/vouch8";
import App from "./App";
import "./index.css";

const config = createConfig({
  chains: [qdayAevum],
  connectors: [injected()],
  transports: {
    [qdayAevum.id]: http("https://rpc-test.qday.info"),
  },
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
