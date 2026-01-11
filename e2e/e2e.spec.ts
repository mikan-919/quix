import { expect, test } from '@playwright/test'

test.describe('E2E Tests: エンドツーエンドテスト', () => {
  test('Initial rendering: カウンターの値と派生状態が正しく表示されること', async ({ page }) => {
    await page.goto('/')

    const h1 = page.getByRole('heading', { level: 1, name: 'My new framework' })
    await expect(h1).toBeVisible()

    const button = page.getByTestId('counter-button')
    await expect(button).toHaveText('Count is:10/')

    const doubleHeading = page.getByRole('heading', {
      level: 2,
      name: 'Double:20',
    })
    await expect(doubleHeading).toBeVisible()
  })

  test('For component: アイテム数がカウンター値と一致すること', async ({ page }) => {
    await page.goto('/')

    const h1 = page.locator('h1').first()
    await expect(h1).toBeVisible()

    const h2Elements = page.locator('h2').filter({ hasText: /^Double:/ })
    await expect(h2Elements).toHaveCount(11)
  })

  test('State update: ボタンクリックでカウンターと派生状態が更新されること', async ({ page }) => {
    await page.goto('/')

    const button = page.getByTestId('counter-button')
    await expect(button).toHaveText('Count is:10/')

    await button.click()
    await expect(button).toHaveText('Count is:11/')

    const doubleHeading = page.getByRole('heading', { level: 2 })
    await expect(doubleHeading.filter({ hasText: 'Double:22' })).toBeVisible()

    const h2Elements = page.locator('h2').filter({ hasText: /^Double:/ })
    await expect(h2Elements).toHaveCount(12)
  })

  test('Consecutive updates: ボタンを複数回クリックして正しく更新されること', async ({ page }) => {
    await page.goto('/')

    const button = page.getByTestId('counter-button')

    for (let i = 0; i < 5; i++) {
      await button.click()
      await expect(button).toHaveText(`Count is:${10 + i + 1}/`)
    }

    await expect(button).toHaveText('Count is:15/')
    await expect(page.getByRole('heading', { level: 2, name: 'Double:30' })).toBeVisible()

    const h2Elements = page.locator('h2').filter({ hasText: /^Double:/ })
    await expect(h2Elements).toHaveCount(16)
  })

  test('Console errors: ページ読み込み時にエラーが出力されていないこと', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')

    await expect(errors).toHaveLength(0)
  })

  test('Show component: モーダルが初期状態で非表示であること', async ({ page }) => {
    await page.goto('/')

    const modalBackdrop = page.getByTestId('modal-backdrop')
    const modalContent = page.getByTestId('modal-content')
    const modalClose = page.getByTestId('modal-close')

    await expect(modalBackdrop).toBeHidden()
    await expect(modalContent).toBeHidden()
    await expect(modalClose).toBeHidden()
  })

  test('Show component: モーダルが開くときに表示されること', async ({ page }) => {
    await page.goto('/')

    const openModalButton = page.getByTestId('open-modal')
    await openModalButton.click()

    const modalBackdrop = page.getByTestId('modal-backdrop')
    const modalContent = page.getByTestId('modal-content')
    const modalTitle = page.getByRole('heading', { name: 'Modal Title' })

    await expect(modalBackdrop).toBeVisible()
    await expect(modalContent).toBeVisible()
    await expect(modalTitle).toBeVisible()
  })

  test('Show component: モーダルのバックドロップで閉じられること', async ({ page }) => {
    await page.goto('/')

    const openModalButton = page.getByTestId('open-modal')
    await openModalButton.click()

    const modalBackdrop = page.getByTestId('modal-backdrop')
    await expect(modalBackdrop).toBeVisible()

    // Click backdrop to close modal
    await modalBackdrop.click()

    await expect(modalBackdrop).toBeHidden()
  })

  test('Show component: モーダルコンテンツクリックで閉じないこと', async ({ page }) => {
    await page.goto('/')

    const openModalButton = page.getByTestId('open-modal')
    await openModalButton.click()

    const modalBackdrop = page.getByTestId('modal-backdrop')
    await expect(modalBackdrop).toBeVisible()

    const modalContent = page.getByTestId('modal-content')
    await modalContent.click()

    await expect(modalBackdrop).toBeVisible()
  })
})
