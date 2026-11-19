import { asc, count, desc, ilike } from 'drizzle-orm'
import z from 'zod'
import { db } from '@/infra/db'
import { schema } from '@/infra/db/schemas'
import { type Either, makeRight } from '@/shared/either'

// Informar filtros que a listagem pode vir a receber
const getUploadsInput = z.object({
  searchQuery: z.string().optional(),
  sortBy: z.enum(['createdAt']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  page: z.number().optional().default(1),
  pageSize: z.number().optional().default(20),
})

type GetUploadsInput = z.input<typeof getUploadsInput>

type GetUploadsOutput = {
  total: number
  uploads: {
    id: string
    name: string
    remoteKey: string
    remoteUrl: string
    createdAt: Date
  }[]
}

export async function getUploads(
  input: GetUploadsInput
): Promise<Either<never, GetUploadsOutput>> {
  const { page, pageSize, searchQuery, sortBy, sortDirection } =
    getUploadsInput.parse(input)

  //offset é usado para quando não se trata de uma paginação infinita, quando for infinita pode-se usar um cursor based pagination (tira um pouco da UX pois só pode navegar para pagina seguinte, e não da pg 1 para 10)
  // Promise.all para executar 2 queries ao mesmo tempo
  const [uploads, [{ total }]] = await Promise.all([
    db
      .select({
        id: schema.uploads.id,
        name: schema.uploads.name,
        remoteKey: schema.uploads.remoteKey,
        remoteUrl: schema.uploads.remoteUrl,
        createdAt: schema.uploads.createdAt,
      })
      .from(schema.uploads)
      .where(
        searchQuery ? ilike(schema.uploads.name, `%${searchQuery}%`) : undefined
      )
      .orderBy(fields => {
        if (sortBy && sortDirection === 'asc') {
          return asc(fields[sortBy])
        }

        if (sortBy && sortDirection === 'desc') {
          return desc(fields[sortBy])
        }

        return desc(fields.id)
      })
      .offset((page - 1) * pageSize)
      .limit(pageSize),

    db
      .select({ total: count(schema.uploads.id) })
      .from(schema.uploads)
      .where(
        searchQuery ? ilike(schema.uploads.name, `%${searchQuery}%`) : undefined
      ),
  ])

  return makeRight({ uploads, total })
}
