import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { supplierApi } from './api/client'

function renderRoute(route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Supplier frontend routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the public supplier scaffold and checks the API', async () => {
    const getSupplierPage = vi.spyOn(supplierApi, 'GET').mockResolvedValue({
      data: {
        items: [],
        page: 0,
        size: 20,
        totalItems: 21,
        totalPages: 2,
      },
      response: new Response(null, { status: 200 }),
    })

    renderRoute('/suppliers')

    expect(
      screen.getByRole('heading', { name: 'Campus suppliers' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/21 active suppliers/i)).toBeInTheDocument()
    expect(getSupplierPage).toHaveBeenCalledWith('/api/suppliers')
  })

  it('loads the admin placeholder without exposing mutation controls', () => {
    renderRoute('/admin/suppliers')

    expect(
      screen.getByRole('heading', { name: 'Supplier administration' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a not-found page for unknown frontend routes', () => {
    renderRoute('/somewhere-else')

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })
})
