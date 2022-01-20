import { gql, useQuery, useSubscription } from "@apollo/client";
import React from "react";

export const App = () => {
  const { data } = useQuery(
    gql`
      {
        users {
          userId
          name
          hello
          favouriteProducts {
            id
            name
          }
        }
      }
    `,
  );

  const { data: subscriptionData } = useSubscription(gql`
    subscription {
      productUpdates {
        id
        name
      }
    }
  `);

  console.log("subscription:", subscriptionData);

  return (
    <div style={{ whiteSpace: "pre-wrap" }}>
      some data here: {JSON.stringify(data, null, 2)}
    </div>
  );
};
