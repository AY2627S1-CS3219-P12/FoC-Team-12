import { useQuery } from '@tanstack/react-query'
import { supplierApi } from './client'

export const supplierSummaryQueryKey = ['suppliers', 'summary'] as const

export function useSupplierSummaryQuery() {
  return useQuery({
    queryKey: supplierSummaryQueryKey,
    queryFn: async () => {
      const { data, error, response } = await supplierApi.GET('/api/suppliers')

      if (error || !data) {
        throw new Error(
          `Supplier API returned ${response.status}. Check that Spring Boot is running on port 8080.`,
        )
      }

      return data
    },
  })
}
