import { expect, it } from 'vitest'
import api from '../../../docs/contracts/n2h.openapi.json'
import { isReportContext } from './cases'

const orderId = '10000000-0000-4000-8000-000000000001'
const caseId = '20000000-0000-4000-8000-000000000001'
const published = api.components.schemas.ReportContext.oneOf.flatMap((branch) =>
  branch.properties.status.enum.map((status) => ({
    orderId,
    status,
    caseId: branch.properties.caseId.type === 'null' ? null : caseId,
    state: branch.properties.state.type === 'null' ? null : 'OPEN',
  })),
)
it.each(published)('accepts the producer schema context $status', (value) => {
  expect(isReportContext(value, orderId)).toBe(true)
  expect(isReportContext({ ...value, orderId: caseId }, orderId)).toBe(false)
  expect(
    isReportContext(
      { ...value, caseId: value.caseId ? null : caseId },
      orderId,
    ),
  ).toBe(false)
})
it('retains only the documented rollout aliases', () => {
  for (const status of ['PREPARATION_AVAILABLE', 'ELIGIBLE', 'INELIGIBLE'])
    expect(
      isReportContext({ orderId, status, caseId: null, state: null }, orderId),
    ).toBe(true)
  expect(
    isReportContext(
      { orderId, status: 'UNSUPPORTED', caseId: null, state: null },
      orderId,
    ),
  ).toBe(false)
})
