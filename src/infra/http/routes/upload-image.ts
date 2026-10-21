import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { uploadImage } from '@/app/functions/upload-image'
import { isRight, unwrapEither } from '@/shared/either'

export const uploadImageRoute: FastifyPluginAsyncZod = async server => {
  server.post(
    '/uploads',
    {
      schema: {
        summary: 'Upload an image',
        consumes: ['multipart/form-data'],
        // body: z.object({
        //   name: z.string(),
        //   password: z.string().optional(),
        // }),
        response: {
          201: z.null().describe('Image uploaded'),
          400: z.object({ message: z.string() }),
          409: z
            .object({ message: z.string() })
            .describe('Upload already exists!'),
        },
      },
    },
    async (request, reply) => {
      const uploadedFile = await request.file({
        limits: {
          // Aborta a leitura da stream ao chegar nesse limite
          fileSize: 1024 * 1024 * 2, //2MB
        },
      })

      // await db.insert(schema.uploads).values({
      //   name: 'insert code test',
      //   remoteKey: 'teste2.jpg',
      //   remoteUrl: 'http://asdfg.com',
      // })

      if (!uploadedFile) {
        return reply.status(400).send({ message: 'File is required' })
      }

      const result = await uploadImage({
        fileName: uploadedFile.filename,
        contentType: uploadedFile.mimetype,
        contentStream: uploadedFile.file,
      })

      if (uploadedFile.file.truncated) {
        return reply.status(400).send({
          message: 'File size limit reached.',
        })
      }

      if (isRight(result)) {
        console.log(unwrapEither(result))
        return reply.status(201)
      }

      const error = unwrapEither(result)

      switch (error.constructor.name) {
        case 'InvalidFileFormat':
          return reply.status(400).send({ message: error.message })
      }
    }
  )
}
