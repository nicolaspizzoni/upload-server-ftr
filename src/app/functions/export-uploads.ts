import { PassThrough, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { stringify } from 'csv-stringify'
import { ilike } from 'drizzle-orm'
import z from 'zod'
import { db, pg } from '@/infra/db'
import { schema } from '@/infra/db/schemas'
import { uploadFileToStorage } from '@/infra/storage/upload-file-to-storage'
import { type Either, makeRight } from '@/shared/either'

const exportUploadsInput = z.object({
  searchQuery: z.string().optional(),
})

type ExportUploadsInput = z.input<typeof exportUploadsInput>

type ExportUploadsOutput = {
  reportUrl: string
}

export async function exportUploads(
  input: ExportUploadsInput
): Promise<Either<never, ExportUploadsOutput>> {
  const { searchQuery } = exportUploadsInput.parse(input)

  // usando toSQL para poder pegar o comando sql e parametros atraves do drizzle
  const { sql, params } = db
    .select({
      id: schema.uploads.id,
      name: schema.uploads.name,
      remoteUrl: schema.uploads.remoteUrl,
      createdAt: schema.uploads.createdAt,
    })
    .from(schema.uploads)
    .where(
      searchQuery ? ilike(schema.uploads.name, `%${searchQuery}%`) : undefined
    )
    .toSQL()

  // Usando comando nativo do pg para escrever o comando SQL (usando direto do drizzle para evitar SQL Injection) e usando cursor para pegar partes dos registros para gravar por partes os dados em uma variavel que será salva parte por parte no R2, limpando os dados que ja foram salvos da memória (escrita incremental), para evitar que a aplicação fique com muita memória alocada (quando se trata de muitos dados/registros)
  const cursor = pg.unsafe(sql, params as string[]).cursor(2)

  //   for await (const rows of cursor) {
  //     console.log(rows)
  //   }

  const csv = stringify({
    delimiter: ',',
    header: true,
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
      { key: 'remote_url', header: 'URL' },
      { key: 'created_at', header: 'Uploaded at' },
    ],
  })

  // Uma casca vazia que irá receber (WRITABLE) o csv com os dados do cursor mas que é usado como passthrough, ou seja irá passar adiante para o contentStream do uploadToStorage
  const uploadToStorageStream = new PassThrough()

  // READABLE / TRANSFORM / TRANSFORM / TRANSFORM => WRITABLE
  const convertToCSVPipeline = pipeline(
    cursor,
    new Transform({
      // objectMode permite fazer tipo um json stringfy em cada chunk para receber em dados primitivos como array, objetos etc
      objectMode: true,
      transform(chunks: unknown[], enconding, callback) {
        for (const chunk of chunks) {
          // escrevendo no output cada linha do banco de dados uma por vez
          this.push(chunk)
        }
        callback()
      },
    }),
    csv,
    uploadToStorageStream
  )

  await convertToCSVPipeline

  const uploadToStorage = uploadFileToStorage({
    contentType: 'text/csv',
    folder: 'downloads',
    fileName: `${new Date().toISOString()}-uploads.csv`,
    contentStream: uploadToStorageStream,
  })

  const [{ url }] = await Promise.all([uploadToStorage, convertToCSVPipeline])

  return makeRight({ reportUrl: url })
}
