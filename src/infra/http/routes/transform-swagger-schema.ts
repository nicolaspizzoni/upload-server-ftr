import { jsonSchemaTransform } from 'fastify-type-provider-zod'

//Parameters traz os tipos do parametros que uma função recebe
type transformSwaggerSchemaData = Parameters<typeof jsonSchemaTransform>[0]

export function transformSwaggerSchema(data: transformSwaggerSchemaData) {
  const { schema, url } = jsonSchemaTransform(data)

  if (schema.consumes?.includes('multipart/form-data')) {
    if (schema.body === undefined) {
      schema.body = {
        type: 'object',
        required: [],
        properties: {},
      }
    }

    const body = schema.body as {
      type: string
      required: string[]
      properties: Record<string, unknown>
    }

    body.properties.file = {
      type: 'string',
      format: 'binary',
    }

    body.required.push('file')
  }

  return { schema, url }
}
