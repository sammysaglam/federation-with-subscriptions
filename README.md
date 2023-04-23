# Apollo Federation with Subscriptions

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/sammysaglam/federation-with-subscriptions/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/federation-with-subscriptions.svg?style=flat)](https://www.npmjs.com/package/federation-with-subscriptions)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

This library introduces subscriptions to Apollo Federation (which is currently not supported by apollo-server). Under the hood, it is using graphql-tools to convert the federation into schema-stitching SDL.

This library currently only works with express servers.

## Installation

```bash
yarn add federation-with-subscriptions
```

## Simple example

```ts
import {
  createGateway,
  createMicroservice,
} from "federation-with-subscriptions";
import { PubSub, withFilter } from "graphql-subscriptions";

const pubsub = new PubSub();

const usersMicroservice = () =>
  createMicroservice({
    label: "Users",
    port: 4001,
    typeDefs: `
      type User {
        id: ID!
        name: String!
      }

      type Query {
        users: [User!]!
      }
    `,
    resolvers: {
      Query: {
        users: () => [{ id: "1", name: "Sammy" }],
      },
    },
  });

const blogPostsMicroservice = () =>
  createMicroservice({
    label: "Blog Posts",
    port: 4002,
    context: ({ req }) => ({ headers: req.headers }),
    subscriptionContext: (ctx, message, args, headers) => ({ headers }),
    typeDefs: `
      type BlogPost {
        id: ID!
        title: String!
      }

      extend type User @key(fields: "id") {
        id: ID! @external
        blogPosts: [BlogPost!]!
      }

      type Mutation {
        updateBlogPost: BlogPost!
      }

      type Subscription {
        blogPostUpdates: BlogPost!
      }
    `,
    resolvers: {
      User: {
        blogPosts: () => [{ id: "44", title: "The Latest Post" }],
      },
      Mutation: {
        updateBlogPost: () => {
          const blogPost = {
            id: String(Math.random()),
            title: "A random post",
          };

          pubsub.publish("BLOG_POST_UPDATED", {
            blogPostUpdates: blogPost,
          });

          return blogPost;
        },
      },
      Subscription: {
        blogPostUpdates: {
          subscribe: withFilter(
            () => pubsub.asyncIterator(["BLOG_POST_UPDATED"]),
            (payload, variables, context) => {
              console.log({
                subscriptionContext: context,
              });

              return true;
            },
          ),
        },
      },
    },
  });

const main = async () => {
  const microservices = await Promise.all([
    usersMicroservice(),
    blogPostsMicroservice(),
  ]);

  const { expressApp } = await createGateway({
    microservices,
    port: 4000,

    // send some headers to subgraph microservices
    buildHttpHeaders: ({ req }) => ({
      "authorization": "Bearer secrettoken",
    }),
    buildSubscriptionHeaders: ({ connectionParams }) => ({
      "authorization": "Bearer secrettoken",
    }),
  });
};

main();
```

If you run the above in a Node.js environment, you can visit http://localhost:4000/graphql which will open the Apollo Studio.

**Important**: when testing using Apollo Studio, ensure that you switch the subscriptions implementation to graphql-ws:

![Switch Apollo Studio ws implementation](https://raw.githubusercontent.com/sammysaglam/federation-with-subscriptions/main/img/apollo-studio-graphql-ws.png)

```graphql
{
  users {
    id
    name
    blogPosts {
      id
      title
    }
  }
}
```

```graphql
subscription {
  blogPostUpdates {
    id
    title
  }
}
```

```graphql
mutation {
  updateBlogPost {
    id
    title
  }
}
```

## Subscriptions on the Frontend

Please checkout this repo and run `yarn install` & `yarn start` for a slightly more complex example including a full frontend integration.

## License

federation-with-subscriptions is MIT licensed.
