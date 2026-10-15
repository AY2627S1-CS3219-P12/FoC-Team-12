import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { components } from './schema'
import { supplierApi } from './client'
import type { Supplier } from './supplierQueries'

export type CreateSupplierRequest =
  components['schemas']['CreateSupplierRequest']
export type UpdateSupplierRequest =
  components['schemas']['UpdateSupplierRequest']
export type SupplierStatus = 'ACTIVE' | 'INACTIVE'

export interface AdminSupplierListParameters {
  search?: string
  type?: string
  building?: string
  status?: SupplierStatus
  page: number
  size: number
  sort: string
}

type SupplierProblem =
  | components['schemas']['InvalidRequestProblem']
  | components['schemas']['InvalidSupplierRequestProblem']
  | components['schemas']['SupplierNotFoundProblem']
  | components['schemas']['SupplierUpdateConflictProblem']

export class SupplierMutationError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: SupplierProblem | undefined,
    fallbackMessage: string,
  ) {
    super(problem?.detail ?? fallbackMessage)
    this.name = 'SupplierMutationError'
  }

  get fieldErrors() {
    return 'errors' in (this.problem ?? {})
      ? (this.problem as components['schemas']['InvalidSupplierRequestProblem'])
          .errors
      : undefined
  }
}

function mutationError(
  status: number,
  error: unknown,
  fallbackMessage: string,
) {
  return new SupplierMutationError(
    status,
    typeof error === 'object' && error !== null
      ? (error as SupplierProblem)
      : undefined,
    fallbackMessage,
  )
}

export function useAdminSupplierListQuery(
  parameters: AdminSupplierListParameters,
) {
  return useQuery({
    queryKey: ['suppliers', 'admin', 'list', parameters],
    queryFn: async () => {
      const { data, error, response } = await supplierApi.GET(
        '/api/admin/suppliers',
        { params: { query: parameters } },
      )

      if (error || !data) {
        throw mutationError(
          response.status,
          error,
          'The administrative supplier list could not be loaded.',
        )
      }
      return data
    },
    placeholderData: keepPreviousData,
  })
}

export function useAdminSupplierMetadataQuery() {
  return useQuery({
    queryKey: ['suppliers', 'admin', 'metadata'],
    queryFn: async () => {
      const { data, error } = await supplierApi.GET(
        '/api/admin/suppliers/metadata',
      )
      if (error || !data) {
        throw new SupplierMutationError(
          500,
          undefined,
          'Administrative supplier filters could not be loaded.',
        )
      }
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useInvalidateSupplierQueries() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['suppliers'] })
}

export function useCreateSupplierMutation() {
  const invalidate = useInvalidateSupplierQueries()
  return useMutation({
    mutationFn: async (request: CreateSupplierRequest) => {
      const { data, error, response } = await supplierApi.POST(
        '/api/suppliers',
        { body: request },
      )
      if (error || !data) {
        throw mutationError(
          response.status,
          error,
          'The supplier could not be created.',
        )
      }
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateSupplierMutation() {
  const invalidate = useInvalidateSupplierQueries()
  return useMutation({
    mutationFn: async ({
      id,
      request,
    }: {
      id: string
      request: UpdateSupplierRequest
    }) => {
      const { data, error, response } = await supplierApi.PUT(
        '/api/suppliers/{id}',
        { params: { path: { id } }, body: request },
      )
      if (error || !data) {
        throw mutationError(
          response.status,
          error,
          'The supplier could not be updated.',
        )
      }
      return data
    },
    onSuccess: invalidate,
  })
}

export function useChangeSupplierStatusMutation() {
  const invalidate = useInvalidateSupplierQueries()
  return useMutation({
    mutationFn: async ({
      supplier,
      status,
    }: {
      supplier: Supplier
      status: SupplierStatus
    }) => {
      const { data, error, response } = await supplierApi.PATCH(
        '/api/suppliers/{id}/status',
        {
          params: { path: { id: supplier.id! } },
          body: { status, version: supplier.version! },
        },
      )
      if (error || !data) {
        throw mutationError(
          response.status,
          error,
          'The supplier status could not be changed.',
        )
      }
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteSupplierMutation() {
  const invalidate = useInvalidateSupplierQueries()
  return useMutation({
    mutationFn: async (supplier: Supplier) => {
      const { error, response } = await supplierApi.DELETE(
        '/api/suppliers/{id}',
        {
          params: {
            path: { id: supplier.id! },
            query: { version: supplier.version! },
          },
        },
      )
      if (error || !response.ok) {
        throw mutationError(
          response.status,
          error,
          'The supplier could not be permanently deleted.',
        )
      }
    },
    onSuccess: invalidate,
  })
}
