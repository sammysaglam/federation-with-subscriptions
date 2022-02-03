import { gql, useMutation, useQuery, useSubscription } from "@apollo/client";
import React, { useState } from "react";

import { socket } from "../../server/gateway";

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

  const [receivedData, setReceivedData] = useState<any[]>([]);
  const { data: subscriptionData } = useSubscription(
    gql`
      subscription {
        productUpdates {
          id
          name
          relevantBlogPostsForProduct {
            id
            title
          }
        }
      }
    `,
    {
      onSubscriptionData: (data: any) => {
        console.log(data);
        setReceivedData([
          [new Date(), data?.subscriptionData?.data?.productUpdates],
          ...receivedData,
        ]);
      },
    },
  );

  const [updateProduct] = useMutation(
    gql`
      mutation {
        updateProduct {
          id
        }
      }
    `,
  );

  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        x: 15.9,
        y: 58.9,
        url: "http://localhost/admin/app",
      }),
    );
  });

  console.log("subscription:", subscriptionData);

  return (
    <>
      <div style={{ whiteSpace: "pre-wrap" }}>
        some data here: {JSON.stringify(data, null, 2)}
      </div>

      <br />
      <hr />
      <br />

      <button onClick={() => updateProduct()} type="button">
        Update product
      </button>

      <br />
      <br />
      <hr />
      <br />

      <span>Subscriptions received:</span>
      <div style={{ whiteSpace: "pre-wrap" }}>
        {JSON.stringify(receivedData, null, 2)}
      </div>
    </>
  );
};
