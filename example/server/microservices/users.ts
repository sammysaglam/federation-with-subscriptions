import fs from "fs";
import path from "path";

import { createMicroservice } from "../../../src";
import { socket } from "../gateway";

const NAME = "Users";
const PORT = 4002;

const db = {
  users: [
    {
      userId: "1",
      someOtherId: "dude",
      name: "Johnny",
      moreData: { hello: "world" },
    },
  ],
};

export const usersMicroservice = () => {
  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        x: 15.9,
        y: 58.9,
        url: "http://localhost/admin/users",
      }),
    );
  });

  socket.on("message", (data: any) => {
    console.log(`${data}`);
  });

  return createMicroservice({
    label: NAME,
    port: PORT,
    typeDefs: fs.readFileSync(path.join(__dirname, "users.graphql"), "utf-8"),
    resolvers: {
      Query: {
        users: () => db.users,
      },
    },
  });
};
