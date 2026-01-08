import { expect, test } from '@playwright/test'

test('初期レンダリング: カウンターの値と派生状態が正しく表示されること', async ({
  page,
}) => {
  await page.goto('/')

  const h1 = page.getByRole('heading', { level: 1, name: 'My new framework' })
  await expect(h1).toBeVisible()

  const button = page.getByRole('button')
  await expect(button).toHaveText(/Count is:10/)

  const doubleHeading = page.getByRole('heading', {
    level: 2,
    name: 'Double:20',
  })
  await expect(doubleHeading).toBeVisible()
})

test('Forコンポーネント: アイテム数がカウンター値と一致すること', async ({
  page,
}) => {
  await page.goto('/')

  const h1 = page.locator('h1').first()
  await expect(h1).toBeVisible()

  const h2Elements = page.locator('h2').filter({ hasText: /^Double:/ })
  await expect(h2Elements).toHaveCount(11)
})

test('ステート更新: ボタンクリックでカウンターと派生状態が更新されること', async ({
  page,
}) => {
  await page.goto('/')

  const button = page.getByRole('button')
  await expect(button).toHaveText(/Count is:10/)

  await button.click()
  await expect(button).toHaveText(/Count is:11/)

  const doubleHeading = page.getByRole('heading', { level: 2 })
  await expect(doubleHeading.filter({ hasText: 'Double:22' })).toBeVisible()

  const h2Elements = page.locator('h2').filter({ hasText: /^Double:/ })
  await expect(h2Elements).toHaveCount(12)
})

test('連続更新: ボタンを複数回クリックして正しく更新されること', async ({
  page,
}) => {
  await page.goto('/')

  const button = page.getByRole('button')

  for (let i = 0; i < 5; i++) {
    await button.click()
    await expect(button).toHaveText(new RegExp(`Count is:${10 + i + 1}`))
  }

  await expect(button).toHaveText(/Count is:15/)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Double:30' })
  ).toBeVisible()

  const h2Elements = page.locator('h2').filter({ hasText: /^Double:/ })
  await expect(h2Elements).toHaveCount(16)
})

test('コンソールエラー: ページ読み込み時にエラーが出力されていないこと', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })

  await page.goto('/')

  await expect(errors).toHaveLength(0)
})
