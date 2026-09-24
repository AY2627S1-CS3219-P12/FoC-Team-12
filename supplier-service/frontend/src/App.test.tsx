import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { InitialEntry } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { supplierApi } from './api/client'

const supplierId = 'ca9bd61f-93da-4500-9e9d-48de1bea52fa'
const secondSupplierId = '184a5d15-0714-47ad-9ee9-524bf84f361c'

const activeSupplier = {
  id: supplierId,
  name: "Anna's x Soup Union",
  type: 'Food',
  building: 'Central Library',
  floor: '1',
  locationDescription: 'Next to NUS Co-op',
  latitude: 1.296444,
  longitude: 103.773032,
  openingTime: '09:00:00',
  closingTime: '18:00:00',
  imageUrl: 'https://github.com/example/assets/blob/main/anna.jpg',
  status: 'ACTIVE',
  version: 0,
  createdAt: '2026-09-23T00:00:00Z',
  updatedAt: '2026-09-23T00:00:00Z',
}

const inactiveSupplier = {
  ...activeSupplier,
  id: secondSupplierId,
  name: 'Former Campus Shop',
  status: 'INACTIVE',
  imageUrl: null,
}

const metadata = {
  types: ['Food', 'Food/Coffee', 'Printing', 'Shopping'],
  buildings: ['Blk AS8', 'Central Library', 'COM3'],
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':
        status >= 400 ? 'application/problem+json' : 'application/json',
    },
  })
}

function mockApi(
  handler?: (url: string) => Response | Promise<Response> | undefined,
) {
  const urls: string[] = []
  vi.spyOn(supplierApi, 'GET').mockImplementation(async (...args) => {
    const path = String(args[0])
    const options = args[1] as
      | {
          params?: {
            query?: Record<string, string | number | undefined>
            path?: { id?: string }
          }
        }
      | undefined
    let url = path.replace('{id}', options?.params?.path?.id ?? '{id}')
    const query = new URLSearchParams()
    for (const [name, value] of Object.entries(options?.params?.query ?? {})) {
      if (value !== undefined) query.set(name, String(value))
    }
    if (query.size > 0) url += `?${query.toString()}`
    urls.push(url)

    let response = await handler?.(url)

    if (!response && url.includes('/api/suppliers/metadata')) {
      response = jsonResponse(metadata)
    }
    if (!response && url.includes(`/api/suppliers/${supplierId}`)) {
      response = jsonResponse(activeSupplier)
    }
    if (!response && url.includes(`/api/suppliers/${secondSupplierId}`)) {
      response = jsonResponse(inactiveSupplier)
    }
    if (!response && url.includes('/api/suppliers')) {
      response = jsonResponse({
        items: [activeSupplier],
        page: 0,
        size: 12,
        totalItems: 21,
        totalPages: 2,
      })
    }
    response ??= jsonResponse({}, 404)

    const body = (await response.clone().json()) as unknown
    return response.ok
      ? ({ data: body, response } as never)
      : ({ error: body, response } as never)
  })
  return { urls }
}

function LocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  )
}

function renderRoute(route: InitialEntry, extra?: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
        <LocationProbe />
        {extra}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Public supplier directory', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('renders the default page, public card content, and 12-record request', async () => {
    const { urls } = mockApi()
    renderRoute('/suppliers')

    expect(
      screen.getByRole('heading', { name: 'Campus locations' }),
    ).toBeInTheDocument()
    expect(await screen.findByText("Anna's x Soup Union")).toBeInTheDocument()
    expect(screen.getByText('Central Library · Floor 1')).toBeInTheDocument()
    expect(screen.getByText('Next to NUS Co-op')).toBeInTheDocument()
    expect(screen.getByText(/9:00 am–6:00 pm/i)).toBeInTheDocument()
    expect(screen.getByText('21 active locations')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Admin' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /create|edit|delete/i }),
    ).not.toBeInTheDocument()

    const listCall = urls.find((url) => /\/api\/suppliers\?/.test(url))
    expect(listCall).toContain('page=0')
    expect(listCall).toContain('size=12')
    expect(listCall).toContain('sort=name%2Casc')
  })

  it('shows loading skeletons while the first page is pending', () => {
    mockApi((url) => {
      if (/\/api\/suppliers\?/.test(url)) {
        return new Promise<Response>(() => undefined)
      }
      return undefined
    })
    renderRoute('/suppliers')
    expect(
      screen.getByLabelText('Loading campus locations'),
    ).toBeInTheDocument()
  })

  it('debounces search, stores it in the URL, and resets the page', async () => {
    mockApi()
    const user = userEvent.setup()
    renderRoute('/suppliers?page=1')

    await user.type(
      screen.getByRole('searchbox', { name: 'Search locations' }),
      'coffee',
    )
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/suppliers?page=1',
    )
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/suppliers?search=coffee',
    )
  })

  it('syncs filters to the URL and resets pagination', async () => {
    mockApi()
    const user = userEvent.setup()
    renderRoute('/suppliers?page=1')

    await screen.findByRole('option', { name: 'Food' })
    await user.selectOptions(screen.getByLabelText('Category'), 'Food')
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/suppliers?type=Food',
    )

    await user.selectOptions(
      screen.getByLabelText('Building'),
      'Central Library',
    )
    expect(screen.getByTestId('location').textContent).toContain(
      'building=Central+Library',
    )
  })

  it.each([
    'name,asc',
    'name,desc',
    'type,asc',
    'building,asc',
    'openingTime,asc',
    'openingTime,desc',
    'closingTime,asc',
    'closingTime,desc',
  ])('supports the exposed %s sort option', async (sort) => {
    mockApi()
    const user = userEvent.setup()
    renderRoute('/suppliers?page=1')

    await user.selectOptions(screen.getByLabelText('Sort by'), sort)
    const location = screen.getByTestId('location').textContent ?? ''
    expect(location).not.toContain('page=1')
    if (sort === 'name,asc') expect(location).toBe('/suppliers')
    else expect(location).toContain(`sort=${encodeURIComponent(sort)}`)
  })

  it('uses one-based pagination labels and zero-based URL pages', async () => {
    mockApi()
    const user = userEvent.setup()
    renderRoute('/suppliers')

    expect(await screen.findByText(/Page/)).toHaveTextContent('Page 1 of 2')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/suppliers?page=1',
    )
  })

  it('shows an empty state and clears filters', async () => {
    mockApi((url) =>
      /\/api\/suppliers\?/.test(url)
        ? jsonResponse({
            items: [],
            page: 0,
            size: 12,
            totalItems: 0,
            totalPages: 0,
          })
        : undefined,
    )
    const user = userEvent.setup()
    renderRoute('/suppliers?search=missing&type=Food')

    expect(await screen.findByText('No locations found')).toBeInTheDocument()
    const panel = screen.getByText('No locations found').closest('section')!
    await user.click(
      within(panel).getByRole('button', { name: 'Clear filters' }),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/suppliers')
  })

  it('preserves filters on failure and retries explicitly', async () => {
    let listAttempts = 0
    mockApi((url) => {
      if (!/\/api\/suppliers\?/.test(url)) return undefined
      listAttempts += 1
      if (listAttempts === 1) return jsonResponse({ title: 'Error' }, 500)
      return jsonResponse({
        items: [activeSupplier],
        page: 0,
        size: 12,
        totalItems: 1,
        totalPages: 1,
      })
    })
    const user = userEvent.setup()
    renderRoute('/suppliers?type=Food')

    expect(
      await screen.findByText('Locations could not be loaded'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toContain('type=Food')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText("Anna's x Soup Union")).toBeInTheDocument()
    expect(listAttempts).toBe(2)
  })
})

describe('Public supplier details', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads an active supplier image over the branded placeholder', async () => {
    mockApi()
    renderRoute(`/suppliers/${supplierId}`)

    expect(
      await screen.findByRole('heading', { name: "Anna's x Soup Union" }),
    ).toBeInTheDocument()
    expect(screen.getByText('Next to NUS Co-op')).toBeInTheDocument()
    expect(screen.getByText('1.296444, 103.773032')).toBeInTheDocument()
    expect(screen.queryByText(/currently unavailable/i)).not.toBeInTheDocument()

    const image = screen.getByRole('img', {
      name: /Anna's x Soup Union location/,
    })
    expect(image).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/example/assets/main/anna.jpg',
    )
    expect(screen.getByText('Loading photo…')).toBeInTheDocument()

    fireEvent.load(image)
    expect(image.className).toContain('imageLoaded')
  })

  it('replaces a failed supplier image with the branded placeholder', async () => {
    mockApi()
    renderRoute(`/suppliers/${supplierId}`)

    const image = await screen.findByRole('img', {
      name: /Anna's x Soup Union location/,
    })
    fireEvent.error(image)
    expect(
      screen.queryByRole('img', { name: /Anna's x Soup Union location/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: "Anna's x Soup Union photo not available",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Photo not available')).toBeInTheDocument()
    expect(screen.getByText('Next to NUS Co-op')).toBeInTheDocument()
  })

  it('renders an inactive historical supplier with an unavailable notice', async () => {
    mockApi()
    renderRoute(`/suppliers/${secondSupplierId}`)

    expect(
      await screen.findByRole('heading', { name: 'Former Campus Shop' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Location currently unavailable'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: 'Former Campus Shop photo not available',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Photo not available')).toBeInTheDocument()
  })

  it('treats a blank supplier image URL as missing', async () => {
    mockApi((url) => {
      if (url.includes(`/api/suppliers/${supplierId}`)) {
        return jsonResponse({ ...activeSupplier, imageUrl: '   ' })
      }
      return undefined
    })
    renderRoute(`/suppliers/${supplierId}`)

    expect(
      await screen.findByRole('img', {
        name: "Anna's x Soup Union photo not available",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: /Anna's x Soup Union location/ }),
    ).not.toBeInTheDocument()
  })

  it('rejects malformed IDs without calling the detail API', () => {
    const { urls } = mockApi()
    renderRoute('/suppliers/not-a-uuid')

    expect(screen.getByText('Invalid location link')).toBeInTheDocument()
    expect(urls.some((url) => url.includes('/api/suppliers/not-a-uuid'))).toBe(
      false,
    )
  })

  it('shows a friendly not-found state for an unknown UUID', async () => {
    const unknownId = '11111111-1111-4111-8111-111111111111'
    mockApi((url) =>
      url.includes(unknownId)
        ? jsonResponse({ title: 'Supplier not found' }, 404)
        : undefined,
    )
    renderRoute(`/suppliers/${unknownId}`)
    expect(await screen.findByText('Location not found')).toBeInTheDocument()
  })

  it('restores the previous filtered directory URL', async () => {
    mockApi()
    renderRoute({
      pathname: `/suppliers/${supplierId}`,
      state: { from: '/suppliers?search=coffee&page=1' },
    })

    expect(
      await screen.findByRole('link', { name: 'Back to campus locations' }),
    ).toHaveAttribute('href', '/suppliers?search=coffee&page=1')
  })

  it('falls back to the directory for a refreshed deep link', async () => {
    mockApi()
    renderRoute(`/suppliers/${supplierId}`)

    expect(
      await screen.findByRole('link', { name: 'Back to campus locations' }),
    ).toHaveAttribute('href', '/suppliers')
  })
})

describe('Other frontend routes', () => {
  it('keeps the unlinked admin placeholder', () => {
    renderRoute('/admin/suppliers')
    expect(
      screen.getByRole('heading', { name: 'Supplier administration' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Admin' }),
    ).not.toBeInTheDocument()
  })

  it('handles unknown routes', () => {
    renderRoute('/somewhere-else')
    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })
})
