import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { CollectionView } from './CollectionView';

const apiMocks = vi.hoisted(() => ({
  getCollections: vi.fn(),
  getCollectionSellability: vi.fn(),
  updateCatalogCardMetadata: vi.fn(),
  previewCollectionImport: vi.fn(),
  commitCollectionImport: vi.fn(),
  previewCollectionTransferToInventory: vi.fn(),
  commitCollectionTransferToInventory: vi.fn(),
  adjustCollectionRow: vi.fn(),
  deleteCollectionRow: vi.fn(),
  clearCollection: vi.fn(),
  importCards: vi.fn(),
}));

vi.mock('../api/client', () => ({
  api: apiMocks,
}));

const baseRow = {
  catalogCardId: 1,
  tcgProductId: 101,
  productName: 'Base Card',
  title: null,
  setCode: 'ORG',
  setName: 'Origins',
  collectorNumber: '001',
  normalizedNumber: '001',
  rarity: 'Common',
  photoUrl: null,
  kind: 'normal',
  kindSource: 'explicit',
  normalQty: 3,
  foilQty: 0,
  totalQty: 3,
  keepTarget: 3,
  keepNormalQty: 3,
  keepFoilQty: 0,
  sellNormalQty: 0,
  sellFoilQty: 0,
  excluded: false,
  excludedReason: null,
  needsClassification: false,
  reasons: ['Keep up to 3 normal copies.'],
  reasonCodes: ['keep_target'],
  primaryReasonCode: 'keep_target',
  opportunityType: null,
  keepTargetSatisfiedByNormal: true,
  sourceItems: [
    {
      collectionItemId: 101,
      finish: 'Normal',
      finishKind: 'normal',
      quantity: 3,
      recommendedSellQuantity: 0,
      condition: 'Near Mint',
      language: 'EN',
    },
  ],
  transferItems: [],
};

function paginationRows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = 1000 + index;
    return {
      ...baseRow,
      catalogCardId: id,
      productName: `Page Card ${String(index + 1).padStart(3, '0')}`,
      normalQty: 1,
      totalQty: 1,
      sellNormalQty: 1,
      sourceItems: [
        {
          collectionItemId: id,
          finish: 'Normal',
          finishKind: 'normal',
          quantity: 1,
          recommendedSellQuantity: 1,
          condition: 'Near Mint',
          language: 'EN',
        },
      ],
      transferItems: [
        {
          collectionItemId: id,
          finish: 'Normal',
          finishKind: 'normal',
          quantity: 1,
          recommendedSellQuantity: 1,
          condition: 'Near Mint',
          language: 'EN',
        },
      ],
    };
  });
}

describe('CollectionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getCollections.mockResolvedValue({
      collections: [
        { id: 1, name: 'Default', purpose: 'owned' },
        { id: 2, name: 'To Be Sold', purpose: 'to_be_sold' },
      ],
    });
    apiMocks.getCollectionSellability.mockResolvedValue({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      summary: {
        sellNormalQty: 2,
        sellFoilQty: 1,
        excludedCards: 1,
        needsClassificationCards: 1,
      },
      rows: [
        {
          ...baseRow,
          catalogCardId: 10,
          productName: 'Keep Card',
        },
        {
          ...baseRow,
          catalogCardId: 11,
          productName: 'Sell Extra Card',
          normalQty: 5,
          totalQty: 5,
          sellNormalQty: 2,
          sourceItems: [
            {
              collectionItemId: 111,
              finish: 'Normal',
              finishKind: 'normal',
              quantity: 5,
              recommendedSellQuantity: 2,
              condition: 'Near Mint',
              language: 'EN',
            },
          ],
          transferItems: [
            {
              collectionItemId: 111,
              finish: 'Normal',
              finishKind: 'normal',
              quantity: 5,
              recommendedSellQuantity: 2,
              condition: 'Near Mint',
              language: 'EN',
            },
          ],
          reasons: ['2 copies exceed keep target.'],
          primaryReasonCode: 'over_cap',
          opportunityType: 'over_cap',
        },
        {
          ...baseRow,
          catalogCardId: 12,
          productName: 'Shiny Swap Card',
          normalQty: 1,
          foilQty: 1,
          totalQty: 2,
          keepTarget: 1,
          sellFoilQty: 1,
          sourceItems: [
            {
              collectionItemId: 121,
              finish: 'Normal',
              finishKind: 'normal',
              quantity: 1,
              recommendedSellQuantity: 0,
              condition: 'Near Mint',
              language: 'EN',
            },
            {
              collectionItemId: 122,
              finish: 'Foil',
              finishKind: 'foil',
              quantity: 1,
              recommendedSellQuantity: 1,
              condition: 'Near Mint',
              language: 'EN',
            },
          ],
          transferItems: [
            {
              collectionItemId: 122,
              finish: 'Foil',
              finishKind: 'foil',
              quantity: 1,
              recommendedSellQuantity: 1,
              condition: 'Near Mint',
              language: 'EN',
            },
          ],
          reasons: ['Normal copy satisfies keep target; foil can be sold.'],
          primaryReasonCode: 'foil_preference',
          opportunityType: 'foil_swap',
        },
        {
          ...baseRow,
          catalogCardId: 13,
          productName: 'Mystery Card',
          kind: 'unknown',
          kindSource: 'unknown',
          keepTarget: null,
          needsClassification: true,
          reasons: ['Classify card kind before sellability automation.'],
          primaryReasonCode: 'needs_classification',
        },
        {
          ...baseRow,
          catalogCardId: 14,
          productName: 'Rune Token',
          kind: 'rune',
          keepTarget: null,
          excluded: true,
          excludedReason: 'Rune cards are excluded from sellability.',
          sourceItems: [
            {
              collectionItemId: 141,
              finish: 'Normal',
              finishKind: 'normal',
              quantity: 3,
              recommendedSellQuantity: 0,
              condition: 'Near Mint',
              language: 'EN',
            },
          ],
          transferItems: [],
          reasons: ['Rune cards are excluded from sellability.'],
          primaryReasonCode: 'excluded_rune',
        },
      ],
    });
    apiMocks.updateCatalogCardMetadata.mockResolvedValue({ card: {} });
    apiMocks.previewCollectionImport.mockResolvedValue({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      mode: 'merge',
      source: 'tcgplayer_collection_csv',
      summary: {
        totalRows: 2,
        parsedRows: 2,
        matchedCatalogRows: 1,
        createdCatalogRows: 1,
        unresolvedRows: 0,
        totalQuantity: 3,
        normalQuantity: 2,
        foilQuantity: 1,
        warnings: ['Sample warning'],
      },
      rows: [
        {
          rowNumber: 2,
          catalogCardId: 21,
          tcgProductId: 2021,
          productName: 'Imported Owned Card',
          setName: 'Origins',
          number: '021',
          condition: 'Near Mint',
          finish: 'Normal',
          quantity: 2,
          status: 'matched',
          warnings: [],
        },
      ],
    });
    apiMocks.commitCollectionImport.mockResolvedValue({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      mode: 'merge',
      source: 'tcgplayer_collection_csv',
      inserted: 1,
      updated: 1,
      summary: {
        totalRows: 2,
        parsedRows: 2,
        matchedCatalogRows: 1,
        createdCatalogRows: 1,
        unresolvedRows: 0,
        totalQuantity: 3,
        normalQuantity: 2,
        foilQuantity: 1,
        warnings: [],
      },
      rows: [],
    });
    apiMocks.previewCollectionTransferToInventory.mockResolvedValue({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      summary: {
        requestedItems: 1,
        transferableItems: 1,
        blockedItems: 0,
        transferQuantity: 2,
        createRows: 1,
        updateRows: 0,
        warnings: [
          { collectionItemId: 111, warning: 'listed_inventory_row_exists_not_merged' },
          { collectionItemId: 122, warning: 'listed_inventory_row_exists_not_merged' },
        ],
        blockers: [],
      },
      items: [
        {
          collectionItemId: 111,
          catalogCardId: 11,
          quantity: 2,
          availableQuantity: 5,
          finish: 'Normal',
          condition: 'Near Mint',
          inventoryCondition: 'Near Mint',
          action: 'create',
          targetCardId: null,
          status: 'matched',
          marketPrice: 0.12,
          listingPrice: 0.12,
          warnings: [{ collectionItemId: 111, warning: 'listed_inventory_row_exists_not_merged' }],
          blockers: [],
          card: { productName: 'Sell Extra Card', setName: 'Origins', number: '001' },
        },
      ],
    });
    apiMocks.commitCollectionTransferToInventory.mockResolvedValue({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      summary: {
        requestedItems: 1,
        transferableItems: 1,
        blockedItems: 0,
        transferQuantity: 2,
        createRows: 1,
        updateRows: 0,
        warnings: [],
        blockers: [],
      },
      items: [],
      transferredQuantity: 2,
      inserted: 1,
      updated: 0,
    });
    apiMocks.adjustCollectionRow.mockResolvedValue({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      catalogCardId: 11,
      updatedItems: [],
      deletedItemIds: [],
    });
    apiMocks.deleteCollectionRow.mockResolvedValue({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      catalogCardId: 11,
      deletedItemIds: [111],
      deletedQuantity: 2,
    });
  });

  it('renders only the Owned Collection and keeps sellable cards highlighted and prioritized', async () => {
    render(<CollectionView />);

    await waitFor(() => {
      expect(apiMocks.getCollectionSellability).toHaveBeenCalledWith(1);
    });

    expect(screen.queryByRole('heading', { level: 2, name: 'Collection' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Collection' })).toBeNull();
    expect(screen.queryByLabelText(/to be sold collection/i)).toBeNull();
    expect(screen.queryByRole('heading', { name: /to be sold/i })).toBeNull();
    const collectionSection = document.querySelector('.collection-section');
    expect(collectionSection?.firstElementChild).toHaveClass('collection-import-card');
    expect(collectionSection?.querySelector('.section-header')).toBeNull();
    expect(screen.getByText(/import to owned collection/i)).toBeTruthy();
    expect(screen.getByText(/never imports into selling inventory/i)).toBeTruthy();

    expect(await screen.findByLabelText(/sellability summary/i)).toHaveTextContent(
      'Sell Normal2',
    );

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Sell Extra Card')).toBeTruthy();
    expect(rows[0]).toHaveClass('collection-row-sellable');
    expect(within(rows[1]).getByText('Shiny Swap Card')).toBeTruthy();
    expect(within(rows[1]).getByText('Foil swap')).toBeTruthy();
    expect(screen.getByText('Mystery Card')).toBeTruthy();
    expect(screen.getAllByText('Needs Classification').length).toBeGreaterThan(0);
    expect(screen.getByText('Token/Rune excluded')).toBeTruthy();
  });

  it('paginates the complete sorted collection result set and clears hidden transfer selections', async () => {
    const user = userEvent.setup();
    const rows = paginationRows(51);
    apiMocks.getCollectionSellability.mockResolvedValueOnce({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      summary: {
        sellNormalQty: 51,
        sellFoilQty: 0,
        excludedCards: 0,
        needsClassificationCards: 0,
      },
      rows,
    });
    render(<CollectionView />);

    expect(await screen.findByText('Page Card 001')).toBeTruthy();
    expect(screen.getByText('Page Card 050')).toBeTruthy();
    expect(screen.queryByText('Page Card 051')).toBeNull();
    expect(screen.getByLabelText(/sellability summary/i)).toHaveTextContent(
      'Sell Normal51',
    );
    expect(screen.getByText('Showing 1–50 of 51 (1 of 2)')).toBeTruthy();

    await user.click(screen.getByLabelText(/move page card 001 to selling inventory/i));
    expect(screen.getByText('1 card(s) selected')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText('Page Card 051')).toBeTruthy();
    expect(screen.queryByText('Page Card 001')).toBeNull();
    expect(screen.getByText('Showing 51–51 of 51 (2 of 2)')).toBeTruthy();
    expect(screen.getByText('0 card(s) selected')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(await screen.findByText('Page Card 001')).toBeTruthy();
  });

  it('uses the owned collection id for sellability, import, transfer, and refreshes regardless of legacy collection order', async () => {
    const user = userEvent.setup();
    apiMocks.getCollections.mockResolvedValueOnce({
      collections: [
        { id: 2, name: 'To Be Sold', purpose: 'to_be_sold' },
        { id: 7, name: 'My Owned Cards', purpose: 'owned' },
      ],
    });
    render(<CollectionView />);

    expect(await screen.findByText('Sell Extra Card')).toBeTruthy();
    expect(apiMocks.getCollectionSellability).toHaveBeenCalledWith(7);
    expect(apiMocks.getCollectionSellability).not.toHaveBeenCalledWith(2);

    const file = new File(['Product ID,Quantity\n2021,2\n'], 'owned.csv', {
      type: 'text/csv',
    });
    await user.upload(screen.getByLabelText(/owned collection csv file/i), file);
    await waitFor(() => {
      expect(apiMocks.previewCollectionImport).toHaveBeenCalledWith(7, file, 'merge');
    });
    await user.click(
      screen.getByRole('button', { name: /commit import to owned collection/i }),
    );
    await waitFor(() => {
      expect(apiMocks.commitCollectionImport).toHaveBeenCalledWith(7, file, 'merge');
    });

    await user.click(screen.getByLabelText(/move sell extra card to selling inventory/i));
    await user.click(screen.getByRole('button', { name: /preview move/i }));
    await waitFor(() => {
      expect(apiMocks.previewCollectionTransferToInventory).toHaveBeenCalledWith(7, {
        items: [{ collectionItemId: 111, quantity: 2 }],
      });
    });
    await user.click(screen.getByRole('button', { name: /^move to selling inventory$/i }));
    await waitFor(() => {
      expect(apiMocks.commitCollectionTransferToInventory).toHaveBeenCalledWith(7, {
        items: [{ collectionItemId: 111, quantity: 2 }],
      });
    });

    await user.selectOptions(
      screen.getByLabelText(/card kind for mystery card/i),
      'legend',
    );
    await waitFor(() => {
      expect(apiMocks.updateCatalogCardMetadata).toHaveBeenCalledWith(13, {
        cardKind: 'legend',
      });
      expect(apiMocks.getCollectionSellability).toHaveBeenLastCalledWith(7);
    });
    expect(apiMocks.getCollectionSellability).not.toHaveBeenCalledWith(2);
  });

  it('resets an invalid collection page after refreshed results shrink', async () => {
    const user = userEvent.setup();
    apiMocks.getCollectionSellability
      .mockResolvedValueOnce({
        collection: { id: 1, name: 'Default', purpose: 'owned' },
        summary: {
          sellNormalQty: 51,
          sellFoilQty: 0,
          excludedCards: 0,
          needsClassificationCards: 0,
        },
        rows: paginationRows(51),
      })
      .mockResolvedValueOnce({
        collection: { id: 1, name: 'Default', purpose: 'owned' },
        summary: {
          sellNormalQty: 0,
          sellFoilQty: 0,
          excludedCards: 0,
          needsClassificationCards: 0,
        },
        rows: [{ ...baseRow, catalogCardId: 3000, productName: 'Refreshed Card' }],
      });
    render(<CollectionView />);

    expect(await screen.findByText('Page Card 001')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText('Page Card 051')).toBeTruthy();

    await user.selectOptions(
      screen.getByLabelText('Card kind for Page Card 051'),
      'legend',
    );

    expect(await screen.findByText('Refreshed Card')).toBeTruthy();
    expect(screen.queryByText('Page Card 051')).toBeNull();
    expect(screen.queryByText(/showing \d+–\d+ of/i)).toBeNull();
  });

  it('searches collection card names, set names, and collector numbers case-insensitively', async () => {
    const user = userEvent.setup();
    apiMocks.getCollectionSellability.mockResolvedValueOnce({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      summary: {
        sellNormalQty: 9,
        sellFoilQty: 0,
        excludedCards: 0,
        needsClassificationCards: 0,
      },
      rows: [
        {
          ...baseRow,
          catalogCardId: 4000,
          productName: 'Needle Card',
          setName: 'Needle Set',
          collectorNumber: '123',
          normalizedNumber: '123',
        },
        {
          ...baseRow,
          catalogCardId: 4001,
          productName: 'Other Card',
          setName: 'Other Set',
          collectorNumber: '456',
          normalizedNumber: '456',
        },
      ],
    });
    render(<CollectionView />);

    expect(await screen.findByText('Needle Card')).toBeTruthy();
    const searchInput = screen.getByRole('searchbox', { name: /search collection/i });

    await user.type(searchInput, 'nEeDlE cArD');
    expect(screen.getByText('Needle Card')).toBeTruthy();
    expect(screen.queryByText('Other Card')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, 'nEeDlE sEt');
    expect(screen.getByText('Needle Card')).toBeTruthy();
    expect(screen.queryByText('Other Card')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, '123');
    expect(screen.getByText('Needle Card')).toBeTruthy();
    expect(screen.queryByText('Other Card')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, 'no matches');
    expect(await screen.findByText(/no collection cards match "no matches"/i)).toBeTruthy();
    expect(screen.getByLabelText(/sellability summary/i)).toHaveTextContent(
      'Sell Normal9',
    );
  });

  it('filters before pagination and resets the page and hidden selections when search changes', async () => {
    const user = userEvent.setup();
    const rows = paginationRows(75).map((row, index) => ({
      ...row,
      setName: index < 51 ? 'Searchable Set' : 'Other Set',
    }));
    apiMocks.getCollectionSellability.mockResolvedValueOnce({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      summary: {
        sellNormalQty: 75,
        sellFoilQty: 0,
        excludedCards: 0,
        needsClassificationCards: 0,
      },
      rows,
    });
    render(<CollectionView />);

    expect(await screen.findByText('Page Card 001')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText('Page Card 060')).toBeTruthy();
    await user.click(screen.getByLabelText(/move page card 060 to selling inventory/i));
    expect(screen.getByText('1 card(s) selected')).toBeTruthy();

    const searchInput = screen.getByRole('searchbox', { name: /search collection/i });
    await user.type(searchInput, 'searchable set');

    expect(await screen.findByText('Page Card 001')).toBeTruthy();
    expect(screen.queryByText('Page Card 051')).toBeNull();
    expect(screen.queryByText('Page Card 060')).toBeNull();
    expect(screen.getByText('Showing 1–50 of 51 (1 of 2)')).toBeTruthy();
    expect(screen.getByText('0 card(s) selected')).toBeTruthy();
    expect(screen.getByLabelText(/sellability summary/i)).toHaveTextContent(
      'Sell Normal75',
    );

    await user.clear(searchInput);
    expect(await screen.findByText('Page Card 001')).toBeTruthy();
    expect(screen.queryByText('Page Card 051')).toBeNull();
    expect(screen.getByText('Showing 1–50 of 75 (1 of 2)')).toBeTruthy();
    expect(screen.getByText('0 card(s) selected')).toBeTruthy();
  });

  it('uses a single accessible ellipsis menu per collection row and dismisses it on outside click or Escape', async () => {
    const user = userEvent.setup();
    render(<CollectionView />);

    await screen.findByText('Sell Extra Card');
    const sellActions = screen.getByRole('button', {
      name: /actions for sell extra card/i,
    });
    const foilActions = screen.getByRole('button', {
      name: /actions for shiny swap card/i,
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: /^adjust count$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete row$/i })).toBeNull();

    await user.click(sellActions);
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menuitem', { name: /adjust count/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /delete row/i })).toBeTruthy();

    await user.click(foilActions);
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(sellActions);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('adjusts every Normal and Foil source count with validation while preserving the active search', async () => {
    const user = userEvent.setup();
    apiMocks.getCollectionSellability.mockResolvedValueOnce({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      summary: {
        sellNormalQty: 2,
        sellFoilQty: 1,
        excludedCards: 0,
        needsClassificationCards: 0,
      },
      rows: [
        {
          ...baseRow,
          catalogCardId: 20,
          productName: 'Dual Finish Card',
          normalQty: 4,
          foilQty: 2,
          totalQty: 6,
          sellNormalQty: 2,
          sellFoilQty: 1,
          sourceItems: [
            {
              collectionItemId: 201,
              finish: 'Normal',
              finishKind: 'normal',
              quantity: 4,
              recommendedSellQuantity: 2,
              condition: 'Near Mint',
              language: 'EN',
            },
            {
              collectionItemId: 202,
              finish: 'Foil',
              finishKind: 'foil',
              quantity: 2,
              recommendedSellQuantity: 1,
              condition: 'Lightly Played',
              language: 'EN',
            },
          ],
          transferItems: [
            {
              collectionItemId: 201,
              finish: 'Normal',
              finishKind: 'normal',
              quantity: 4,
              recommendedSellQuantity: 2,
              condition: 'Near Mint',
              language: 'EN',
            },
            {
              collectionItemId: 202,
              finish: 'Foil',
              finishKind: 'foil',
              quantity: 2,
              recommendedSellQuantity: 1,
              condition: 'Lightly Played',
              language: 'EN',
            },
          ],
        },
      ],
    });
    render(<CollectionView />);

    expect(await screen.findByText('Dual Finish Card')).toBeTruthy();
    const searchInput = screen.getByRole('searchbox', { name: /search collection/i });
    await user.type(searchInput, 'dual');
    await user.click(
      screen.getByLabelText(/move dual finish card to selling inventory/i),
    );
    expect(screen.getByText('3 card(s) selected')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: /actions for dual finish card/i }),
    );
    await user.click(screen.getByRole('menuitem', { name: /adjust count/i }));

    const dialog = screen.getByRole('dialog', { name: /adjust count for dual finish card/i });
    const normalInput = within(dialog).getByLabelText('Normal · Near Mint · EN');
    const foilInput = within(dialog).getByLabelText('Foil · Lightly Played · EN');
    expect(normalInput).toHaveValue(4);
    expect(foilInput).toHaveValue(2);

    await user.clear(normalInput);
    await user.type(normalInput, '1.5');
    await user.click(within(dialog).getByRole('button', { name: /^save counts$/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /non-negative whole number/i,
    );
    expect(apiMocks.adjustCollectionRow).not.toHaveBeenCalled();

    await user.clear(normalInput);
    await user.type(normalInput, '5');
    await user.clear(foilInput);
    await user.type(foilInput, '0');
    await user.click(within(dialog).getByRole('button', { name: /^save counts$/i }));

    await waitFor(() => {
      expect(apiMocks.adjustCollectionRow).toHaveBeenCalledWith(1, 20, {
        items: [
          { collectionItemId: 201, quantity: 5 },
          { collectionItemId: 202, quantity: 0 },
        ],
      });
    });
    expect(screen.queryByRole('dialog', { name: /adjust count/i })).toBeNull();
    expect(searchInput).toHaveValue('dual');
    expect(screen.getByText('0 card(s) selected')).toBeTruthy();
    expect(apiMocks.getCollectionSellability).toHaveBeenLastCalledWith(1);
    expect(screen.getByText(/updated counts for dual finish card/i)).toBeTruthy();
  });

  it('confirms aggregate row deletion before deleting all represented owned source items', async () => {
    const user = userEvent.setup();
    render(<CollectionView />);

    expect(await screen.findByText('Sell Extra Card')).toBeTruthy();
    const openDelete = async () => {
      await user.click(
        screen.getByRole('button', { name: /actions for sell extra card/i }),
      );
      await user.click(screen.getByRole('menuitem', { name: /delete row/i }));
    };

    await openDelete();
    const dialog = screen.getByRole('dialog', { name: /delete sell extra card/i });
    expect(dialog).toHaveTextContent('Sell Extra Card');
    expect(dialog).toHaveTextContent(/all normal and foil source counts/i);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /delete sell extra card/i })).toBeNull();
    expect(apiMocks.deleteCollectionRow).not.toHaveBeenCalled();

    await openDelete();
    await user.click(
      within(screen.getByRole('dialog', { name: /delete sell extra card/i })).getByRole(
        'button',
        { name: /cancel/i },
      ),
    );
    expect(apiMocks.deleteCollectionRow).not.toHaveBeenCalled();

    await openDelete();
    await user.click(
      within(screen.getByRole('dialog', { name: /delete sell extra card/i })).getByRole(
        'button',
        { name: /^delete row$/i },
      ),
    );
    await waitFor(() => {
      expect(apiMocks.deleteCollectionRow).toHaveBeenCalledWith(1, 11, {
        collectionItemIds: [111],
      });
    });
    expect(apiMocks.getCollectionSellability).toHaveBeenLastCalledWith(1);
    expect(screen.getByText(/deleted sell extra card from owned collection/i)).toBeTruthy();
  });

  it('uses a CSV-only drag-and-drop target for owned collection imports', async () => {
    const user = userEvent.setup();
    render(<CollectionView />);

    const dropzone = await screen.findByRole('button', {
      name: /open collection csv file picker/i,
    });
    const fileInput = screen.getByLabelText(/owned collection csv file/i);
    const clickSpy = vi.spyOn(fileInput, 'click');

    expect(fileInput).toHaveAttribute('accept', '.csv,text/csv');
    expect(screen.getByText(/drop a tcgplayer collection csv here/i)).toBeTruthy();
    expect(screen.getByText(/csv files only/i)).toBeTruthy();

    await user.click(dropzone);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    fireEvent.dragOver(dropzone, {
      dataTransfer: { files: [new File(['invalid'], 'invalid.txt')] },
    });
    expect(dropzone).toHaveClass('active');
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [new File(['invalid'], 'invalid.txt')] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/\.csv file/i);

    const csv = new File(['Product ID,Quantity\n2021,2\n'], 'dropped.csv', {
      type: 'text/csv',
    });
    fireEvent.dragOver(dropzone, { dataTransfer: { files: [csv] } });
    fireEvent.drop(dropzone, { dataTransfer: { files: [csv] } });

    expect(dropzone).not.toHaveClass('active');
    expect(screen.getByText(/selected: dropped\.csv/i)).toBeTruthy();
    await waitFor(() => {
      expect(apiMocks.previewCollectionImport).toHaveBeenCalledWith(1, csv, 'merge');
    });
    expect(screen.queryByRole('button', { name: /preview import/i })).toBeNull();
    expect(await screen.findByLabelText(/collection import preview/i)).toBeTruthy();
  });

  it('announces automatic preview loading, blocks commit, and replaces preview errors when a file is reselected', async () => {
    const user = userEvent.setup();
    let rejectPreview: (reason?: unknown) => void = () => {};
    apiMocks.previewCollectionImport.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectPreview = reject;
      }),
    );
    render(<CollectionView />);

    const fileInput = await screen.findByLabelText(/owned collection csv file/i);
    const firstFile = new File(['Product ID,Quantity\n2021,2\n'], 'first.csv', {
      type: 'text/csv',
    });
    await user.upload(fileInput, firstFile);

    await waitFor(() => {
      expect(apiMocks.previewCollectionImport).toHaveBeenCalledWith(1, firstFile, 'merge');
    });
    expect(screen.getByRole('status')).toHaveTextContent(/previewing collection csv/i);
    expect(screen.queryByRole('button', { name: /preview import/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /commit import to owned collection/i }),
    ).toBeNull();

    rejectPreview(new Error('Preview unavailable'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Preview unavailable');

    const secondFile = new File(['Product ID,Quantity\n2022,1\n'], 'second.csv', {
      type: 'text/csv',
    });
    await user.upload(fileInput, secondFile);

    await waitFor(() => {
      expect(apiMocks.previewCollectionImport).toHaveBeenCalledWith(1, secondFile, 'merge');
      expect(screen.queryByRole('alert')).toBeNull();
    });
    expect(await screen.findByLabelText(/collection import preview/i)).toBeTruthy();
  });

  it('keeps the latest selected file preview when an earlier preview finishes later', async () => {
    const user = userEvent.setup();
    let resolveFirst: (value: unknown) => void = () => {};
    apiMocks.previewCollectionImport.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    render(<CollectionView />);

    const fileInput = await screen.findByLabelText(/owned collection csv file/i);
    const firstFile = new File(['Product ID,Quantity\n2021,1\n'], 'first.csv', {
      type: 'text/csv',
    });
    const secondFile = new File(['Product ID,Quantity\n2022,1\n'], 'second.csv', {
      type: 'text/csv',
    });

    await user.upload(fileInput, firstFile);
    await waitFor(() => {
      expect(apiMocks.previewCollectionImport).toHaveBeenCalledWith(1, firstFile, 'merge');
    });
    await user.upload(fileInput, secondFile);
    await waitFor(() => {
      expect(apiMocks.previewCollectionImport).toHaveBeenCalledWith(1, secondFile, 'merge');
    });
    expect(await screen.findByLabelText(/collection import preview/i)).toHaveTextContent(
      'Imported Owned Card',
    );

    resolveFirst({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      mode: 'merge',
      source: 'tcgplayer_collection_csv',
      summary: {
        totalRows: 1,
        parsedRows: 1,
        matchedCatalogRows: 1,
        createdCatalogRows: 0,
        unresolvedRows: 0,
        totalQuantity: 1,
        normalQuantity: 1,
        foilQuantity: 0,
        warnings: [],
      },
      rows: [
        {
          rowNumber: 2,
          catalogCardId: 22,
          tcgProductId: 2022,
          productName: 'Stale Preview Card',
          setName: 'Origins',
          number: '022',
          condition: 'Near Mint',
          finish: 'Normal',
          quantity: 1,
          status: 'matched',
          warnings: [],
        },
      ],
    });
    await Promise.resolve();

    expect(screen.getByLabelText(/collection import preview/i)).toHaveTextContent(
      'Imported Owned Card',
    );
    expect(screen.queryByText('Stale Preview Card')).toBeNull();
  });

  it('automatically previews and explicitly commits owned collection CSV imports additively without using selling inventory import', async () => {
    const user = userEvent.setup();
    render(<CollectionView />);

    await screen.findByRole('heading', { level: 3, name: /import to owned collection/i });
    const file = new File(['Product ID,Quantity\n2021,2\n'], 'collection.csv', {
      type: 'text/csv',
    });

    expect(screen.queryByRole('radiogroup', { name: /collection import mode/i })).toBeNull();
    expect(screen.queryByLabelText(/set quantities from csv/i)).toBeNull();
    expect(screen.queryByLabelText(/add to existing quantities/i)).toBeNull();
    expect(screen.getByText(/each imported csv quantity is added to a matching owned collection row/i)).toBeTruthy();

    await user.upload(screen.getByLabelText(/owned collection csv file/i), file);
    expect(screen.queryByRole('button', { name: /preview import/i })).toBeNull();

    await waitFor(() => {
      expect(apiMocks.previewCollectionImport).toHaveBeenCalledWith(1, file, 'merge');
    });
    expect(apiMocks.importCards).not.toHaveBeenCalled();
    expect(await screen.findByLabelText(/collection import preview/i)).toHaveTextContent(
      'Import behavior: Add imported quantities to Owned Collection',
    );
    expect(screen.getByLabelText(/collection import preview/i)).toHaveTextContent(
      'Rows Parsed2/2',
    );
    expect(screen.getByText('Imported Owned Card')).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: /commit import to owned collection/i }),
    );

    await waitFor(() => {
      expect(apiMocks.commitCollectionImport).toHaveBeenCalledWith(1, file, 'merge');
    });
    expect(apiMocks.importCards).not.toHaveBeenCalled();
    expect(apiMocks.clearCollection).not.toHaveBeenCalled();
    expect(apiMocks.getCollectionSellability).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/inserted 1, updated 1/i)).toBeTruthy();
  });

  it('previews and commits transfer to Selling Inventory and disables excluded rows', async () => {
    const user = userEvent.setup();
    const onInventoryChanged = vi.fn();
    render(<CollectionView onInventoryChanged={onInventoryChanged} />);

    const sellCheckbox = await screen.findByLabelText(
      /move sell extra card to selling inventory/i,
    );
    const runeCheckbox = screen.getByLabelText(/move rune token to selling inventory/i);
    expect(runeCheckbox).toBeDisabled();

    await user.click(sellCheckbox);
    expect(screen.getByDisplayValue('2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /preview move/i }));

    await waitFor(() => {
      expect(apiMocks.previewCollectionTransferToInventory).toHaveBeenCalledWith(1, {
        items: [{ collectionItemId: 111, quantity: 2 }],
      });
    });
    const transferPreview = await screen.findByLabelText(/transfer preview/i);
    expect(transferPreview).toHaveTextContent('Ready to List');
    expect(transferPreview).toHaveTextContent(
      'Some selected cards already have listed inventory rows',
    );
    expect(transferPreview).toHaveTextContent(
      'separate Ready-to-List staging rows',
    );
    expect(transferPreview).not.toHaveTextContent('listed_inventory_row_exists_not_merged');
    expect(transferPreview).not.toHaveTextContent('[object Object]');
    expect(apiMocks.importCards).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^move to selling inventory$/i }));

    await waitFor(() => {
      expect(apiMocks.commitCollectionTransferToInventory).toHaveBeenCalledWith(1, {
        items: [{ collectionItemId: 111, quantity: 2 }],
      });
    });
    expect(onInventoryChanged).toHaveBeenCalled();
    expect(apiMocks.clearCollection).not.toHaveBeenCalled();
    expect(apiMocks.getCollectionSellability).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/moved 2 card\(s\) to selling inventory/i)).toBeTruthy();
  });

  it('does not expose destructive collection clearing or call the clear API during normal interactions', async () => {
    render(<CollectionView />);

    await screen.findByLabelText(/sellability summary/i);
    expect(screen.queryByLabelText(/clear selected collection/i)).toBeNull();
    expect(screen.queryByLabelText(/type clear collection/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
    expect(screen.queryByText(/destructive: removes rows/i)).toBeNull();
    expect(apiMocks.clearCollection).not.toHaveBeenCalled();
  });

  it('handles a missing Owned Collection without requesting or mutating a legacy collection', async () => {
    apiMocks.getCollections.mockResolvedValueOnce({
      collections: [{ id: 2, name: 'To Be Sold', purpose: 'to_be_sold' }],
    });
    render(<CollectionView />);

    expect(await screen.findByText(/owned collection is unavailable/i)).toBeTruthy();
    expect(screen.queryByLabelText(/owned collection csv file/i)).toBeNull();
    expect(screen.queryByLabelText(/move to selling inventory/i)).toBeNull();
    expect(apiMocks.getCollectionSellability).not.toHaveBeenCalled();
    expect(apiMocks.previewCollectionImport).not.toHaveBeenCalled();
    expect(apiMocks.commitCollectionImport).not.toHaveBeenCalled();
    expect(apiMocks.previewCollectionTransferToInventory).not.toHaveBeenCalled();
    expect(apiMocks.commitCollectionTransferToInventory).not.toHaveBeenCalled();
  });

  it('updates catalog card kind and reloads sellability', async () => {
    const user = userEvent.setup();
    render(<CollectionView />);

    const mysterySelect = await screen.findByLabelText(/card kind for mystery card/i);
    await user.selectOptions(mysterySelect, 'legend');

    await waitFor(() => {
      expect(apiMocks.updateCatalogCardMetadata).toHaveBeenCalledWith(13, {
        cardKind: 'legend',
      });
    });
    expect(apiMocks.getCollectionSellability).toHaveBeenCalledTimes(2);
  });
});
