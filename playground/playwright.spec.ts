import { test, expect } from '@playwright/test'

test.describe('Quix App E2E Tests', () => {
  test('basic rendering - title and button are visible', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await expect(page.locator('h1')).toHaveText('My new framework')
    await expect(page.locator('button[type="button"]')).toHaveCount(2)
  })

  test('basic rendering - counter displays initial value', async ({ page }) => {
    await page.goto('http://localhost:5173')
    const button = page.locator('button[type="button"]').first()
    await expect(button).toContainText('Count is: 10')
  })

  test('state management - incrementing counter updates UI', async ({
    page,
  }) => {
    await page.goto('http://localhost:5173')
    const button = page.locator('button[type="button"]').first()
    const initialText = await button.textContent()

    await button.click()
    await page.waitForTimeout(100)
    const updatedText = await button.textContent()

    expect(initialText).toBe('Count is: 10')
    expect(updatedText).toBe('Count is: 11')
  })

  test('state management - multiple increments', async ({ page }) => {
    await page.goto('http://localhost:5173')
    const button = page.locator('button[type="button"]').first()

    await button.click()
    await page.waitForTimeout(100)
    await button.click()
    await page.waitForTimeout(100)

    const finalText = await button.textContent()
    expect(finalText).toBe('Count is: 12')
  })

  test('derived state - double value is calculated correctly', async ({
    page,
  }) => {
    await page.goto('http://localhost:5173')

    const h2s = page.locator('h2')
    await expect(h2s.nth(0)).toHaveText('My new framework')
    await expect(h2s.nth(1)).toHaveText('Double: 20')
  })

  test('derived state - double updates when count changes', async ({
    page,
  }) => {
    await page.goto('http://localhost:5173')
    const button = page.locator('button[type="button"]').first()

    const initialDouble = await page.locator('h2').nth(1).textContent()
    await expect(initialDouble).toBe('Double: 20')

    await button.click()
    await page.waitForTimeout(100)

    const updatedDouble = await page.locator('h2').nth(1).textContent()
    await expect(updatedDouble).toBe('Double: 22')
  })

  test('event handlers - increment works', async ({ page }) => {
    await page.goto('http://localhost:5173')
    const button = page.locator('button[type="button"]').first()

    const initialCountText = await button.textContent()
    await expect(initialCountText).toMatch(/Count is: 10/)

    await button.click()
    await page.waitForTimeout(100)

    const updatedCountText = await button.textContent()
    await expect(updatedCountText).toMatch(/Count is: 11/)
  })

  test('accessibility - buttons have correct attributes', async ({ page }) => {
    await page.goto('http://localhost:5173')

    const buttons = page.locator('button[type="button"]')
    await expect(buttons).toHaveCount(2)
    await expect(buttons.first()).toHaveAttribute('type', 'button')
  })

  test('styling - inline styles are applied', async ({ page }) => {
    await page.goto('http://localhost:5173')
    const modalContent = page.locator('[data-testid="modal-content"]')

    const style = await modalContent.getAttribute('style')
    expect(style).toContain('background:white')
    expect(style).toContain('padding:2rem')
  })
})
