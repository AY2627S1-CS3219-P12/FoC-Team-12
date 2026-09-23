import createClient from 'openapi-fetch'
import type { paths } from './schema'

export const supplierApi = createClient<paths>({ baseUrl: '' })
