import { ApolloServer, Config, GraphQLOptions } from "apollo-server-express";
import { GraphQLSchema } from "graphql";

export class ExtendedApolloServer extends ApolloServer {
  private readonly _schemaCb?: (
    ...args: Parameters<ApolloServer["createGraphQLServerOptions"]>
  ) => Promise<GraphQLSchema> | GraphQLSchema;
  private readonly _derivedData: WeakMap<GraphQLSchema, any> = new WeakMap();

  constructor({
    schemaCallback,
    ...rest
  }: Config & {
    schemaCallback?: ExtendedApolloServer["_schemaCb"];
  }) {
    super(rest);
    this._schemaCb = schemaCallback;
  }

  public async createGraphQLServerOptions(
    ...args: Parameters<ApolloServer["createGraphQLServerOptions"]>
  ): Promise<GraphQLOptions> {
    const options = await super.createGraphQLServerOptions.apply(this, args);
    if (this._schemaCb) {
      const schema = await this._schemaCb.apply(null, args);
      if (!this._derivedData.has(schema)) {
        this._derivedData.set(
          schema,
          this.constructor.prototype.generateSchemaDerivedData.call(
            this,
            schema,
          ),
        );
      }
      Object.assign(options, await this._derivedData.get(schema));
    }
    return options;
  }
}
