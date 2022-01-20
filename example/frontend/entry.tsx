import {
  ApolloClient,
  ApolloProvider,
  HttpLink,
  InMemoryCache,
  split,
} from "@apollo/client";
import {
  ApolloLink,
  FetchResult,
  Observable,
  Operation,
} from "@apollo/client/core";
import { getMainDefinition } from "@apollo/client/utilities";
import { print } from "graphql";
import { Client, ClientOptions, createClient } from "graphql-ws";
import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";

import { App } from "./components/App";
import { defaultTheme, GlobalStyles } from "./theme/theme";

class WebSocketLink extends ApolloLink {
  private client: Client;

  constructor(options: ClientOptions) {
    super();
    this.client = createClient(options);
  }

  public request(operation: Operation): Observable<FetchResult> {
    return new Observable((sink) =>
      this.client.subscribe<FetchResult>(
        { ...operation, query: print(operation.query) },
        {
          next: sink.next.bind(sink),
          complete: sink.complete.bind(sink),
          error: (err) => {
            if (Array.isArray(err)) {
              // graphQLError[]
              return sink.error(
                new Error(err.map(({ message }) => message).join(", ")),
              );
            }

            if (err instanceof CloseEvent) {
              return sink.error(
                new Error(
                  `Socket closed with event ${err.code} ${err.reason || ""}`, // reason will be available on clean closes only
                ),
              );
            }

            return sink.error(err);
          },
        },
      ),
    );
  }
}

const websocketLink = new WebSocketLink({
  url: "ws://localhost:4000/graphql",
  connectionParams: () => ({
    authorization: `Bearer secretkeywashere`,
  }),
});

const httpLink = new HttpLink({
  uri: "http://localhost:4000/graphql",
  headers: {
    authorization: `Bearer secretkeywashere`,
  },
});

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === "OperationDefinition" &&
      definition.operation === "subscription"
    );
  },
  websocketLink,
  httpLink,
);

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: splitLink,
});

ReactDOM.render(
  <ApolloProvider client={client}>
    <BrowserRouter>
      <ThemeProvider theme={defaultTheme}>
        <GlobalStyles />
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </ApolloProvider>,
  document.getElementById("root"),
);
