import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

describe('CollectionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
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
      mode: 'set',
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
      mode: 'set',
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
    apiMocks.clearCollection.mockResolvedValue({ deleted: 5 });
  });

  it('renders collection recommendations with key states prioritized', async () => {
    render(<CollectionView />);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Collection' }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(apiMocks.getCollectionSellability).toHaveBeenCalledWith(1);
    });
    expect(screen.getByText(/import to owned collection/i)).toBeTruthy();
    expect(screen.getByText(/never imports into selling inventory/i)).toBeTruthy();

    expect(await screen.findByLabelText(/sellability summary/i)).toHaveTextContent(
      'Sell Normal2',
    );
    expect(screen.getByText(/To Be Sold: To Be Sold/i)).toBeTruthy();

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Sell Extra Card')).toBeTruthy();
    expect(within(rows[1]).getByText('Shiny Swap Card')).toBeTruthy();
    expect(within(rows[1]).getByText('Foil swap')).toBeTruthy();
    expect(screen.getByText('Mystery Card')).toBeTruthy();
    expect(screen.getAllByText('Needs Classification').length).toBeGreaterThan(0);
    expect(screen.getByText('Token/Rune excluded')).toBeTruthy();
  });

  it('previews and commits owned collection CSV import without using selling inventory import', async () => {
    const user = userEvent.setup();
    render(<CollectionView />);

    await screen.findByRole('heading', { level: 3, name: /import to owned collection/i });
    const file = new File(['Product ID,Quantity\n2021,2\n'], 'collection.csv', {
      type: 'text/csv',
    });

    expect(screen.getByLabelText(/set quantities from csv/i)).toBeChecked();
    expect(screen.getByText(/does not delete collection rows missing from the file/i)).toBeTruthy();
    expect(screen.getByText(/adds csv quantities on top/i)).toBeTruthy();

    await user.upload(screen.getByLabelText(/owned collection csv file/i), file);
    await user.click(screen.getByRole('button', { name: /preview import/i }));

    await waitFor(() => {
      expect(apiMocks.previewCollectionImport).toHaveBeenCalledWith(1, file, 'set');
    });
    expect(apiMocks.importCards).not.toHaveBeenCalled();
    expect(await screen.findByLabelText(/collection import preview/i)).toHaveTextContent(
      'Preview mode: Set quantities from CSV',
    );
    expect(screen.getByLabelText(/collection import preview/i)).toHaveTextContent(
      'Rows Parsed2/2',
    );
    expect(screen.getByText('Imported Owned Card')).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: /commit import to owned collection/i }),
    );

    await waitFor(() => {
      expect(apiMocks.commitCollectionImport).toHaveBeenCalledWith(1, file, 'set');
    });
    expect(apiMocks.importCards).not.toHaveBeenCalled();
    expect(apiMocks.getCollectionSellability).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/inserted 1, updated 1/i)).toBeTruthy();
  });

  it('passes additive merge mode when Add to existing quantities is selected', async () => {
    const user = userEvent.setup();
    apiMocks.previewCollectionImport.mockResolvedValueOnce({
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
      rows: [],
    });
    render(<CollectionView />);

    const file = new File(['Product ID,Quantity\n2021,1\n'], 'increment.csv', {
      type: 'text/csv',
    });
    await user.click(screen.getByLabelText(/add to existing quantities/i));
    await user.upload(screen.getByLabelText(/owned collection csv file/i), file);
    await user.click(screen.getByRole('button', { name: /preview import/i }));

    await waitFor(() => {
      expect(apiMocks.previewCollectionImport).toHaveBeenCalledWith(1, file, 'merge');
    });
    expect(await screen.findByLabelText(/collection import preview/i)).toHaveTextContent(
      'Preview mode: Add to existing quantities',
    );
    expect(apiMocks.importCards).not.toHaveBeenCalled();
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
    expect(apiMocks.getCollectionSellability).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/moved 2 card\(s\) to selling inventory/i)).toBeTruthy();
  });

  it('requires typed confirmation before clearing the selected collection and refreshes', async () => {
    const user = userEvent.setup();
    render(<CollectionView />);

    const clearButton = await screen.findByRole('button', { name: /clear default/i });
    expect(clearButton).toBeDisabled();
    expect(screen.getByText(/does not delete catalog data/i)).toBeTruthy();

    await user.type(screen.getByLabelText(/type clear collection/i), 'CLEAR COLLECTION');
    expect(clearButton).toBeEnabled();
    await user.click(clearButton);

    await waitFor(() => {
      expect(apiMocks.clearCollection).toHaveBeenCalledWith(
        1,
        'CLEAR COLLECTION',
      );
    });
    expect(apiMocks.getCollectionSellability).toHaveBeenCalledTimes(2);
    expect(apiMocks.importCards).not.toHaveBeenCalled();
    expect(screen.getByText(/cleared 5 collection row/i)).toBeTruthy();
  });

  it('uses staging labels and disables zero-quantity rows in To Be Sold collection', async () => {
    apiMocks.getCollections.mockResolvedValueOnce({
      collections: [{ id: 2, name: 'To Be Sold', purpose: 'to_be_sold' }],
    });
    apiMocks.getCollectionSellability.mockResolvedValueOnce({
      collection: { id: 2, name: 'To Be Sold', purpose: 'to_be_sold' },
      summary: {
        sellNormalQty: 0,
        sellFoilQty: 0,
        excludedCards: 0,
        needsClassificationCards: 0,
      },
      rows: [
        {
          ...baseRow,
          catalogCardId: 201,
          productName: 'Staged Card',
          normalQty: 4,
          totalQty: 4,
          sellNormalQty: 0,
          sourceItems: [
            {
              collectionItemId: 2011,
              finish: 'Normal',
              finishKind: 'normal',
              quantity: 4,
              recommendedSellQuantity: 4,
              condition: 'Near Mint',
              language: 'EN',
            },
          ],
          transferItems: [
            {
              collectionItemId: 2011,
              finish: 'Normal',
              finishKind: 'normal',
              quantity: 4,
              recommendedSellQuantity: 4,
              condition: 'Near Mint',
              language: 'EN',
            },
          ],
        },
        {
          ...baseRow,
          catalogCardId: 202,
          productName: 'Zero Staged Card',
          normalQty: 0,
          totalQty: 0,
          sourceItems: [
            {
              collectionItemId: 2021,
              finish: 'Normal',
              finishKind: 'normal',
              quantity: 0,
              recommendedSellQuantity: 0,
              condition: 'Near Mint',
              language: 'EN',
            },
          ],
          transferItems: [],
        },
      ],
    });

    render(<CollectionView />);

    expect(
      await screen.findByText(/to be sold staging cards ready to move/i),
    ).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /available/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /move qty/i })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /keep target/i })).toBeNull();
    expect(screen.getByText('Ready to move')).toBeTruthy();
    expect(screen.getByLabelText(/move staged card to selling inventory/i)).toBeEnabled();
    expect(screen.getByLabelText(/move zero staged card to selling inventory/i)).toBeDisabled();
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
