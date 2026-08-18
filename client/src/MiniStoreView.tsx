import {
  Minus,
  ImageUp,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, apiUrl } from './api';
import { ProductImageCropDialog } from './ProductImageCropDialog';

type ProductCategory = 'STORE_PRODUCT' | 'EXTRA_CHARGE';
type PaymentMethod = 'CASH' | 'GCASH' | 'CARD';

interface Product {
  id: number;
  name: string;
  category: ProductCategory;
  sellingPriceCentavos: number;
  imageUrl: string | null;
  isActive: boolean;
}

interface ActiveRoom {
  id: number;
  number: string;
  stays: { id: number }[];
}

interface MiniStoreViewProps {
  isOwner: boolean;
  rooms: ActiveRoom[];
}

const fallbackImage = '/oha-logo.jpg';
const productImageSource = (imageUrl: string | null) =>
  imageUrl?.startsWith('/api/')
    ? `${apiUrl.replace(/\/api\/?$/, '')}${imageUrl}`
    : (imageUrl ?? fallbackImage);
const money = (centavos: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(centavos / 100);

export function MiniStoreView({ isOwner, rooms }: MiniStoreViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | ProductCategory>('ALL');
  const [purchaseProduct, setPurchaseProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | 'NEW' | null>(
    null,
  );
  const [manageProducts, setManageProducts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadProducts = useCallback(async (): Promise<void> => {
    try {
      const suffix = isOwner && manageProducts ? '?includeInactive=true' : '';
      const response = await apiRequest<{ data: Product[] }>(
        `/products${suffix}`,
      );
      setProducts(response.data);
      setMessage(null);
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Products could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [isOwner, manageProducts]);

  useEffect(() => {
    void loadProducts();
    const refresh = () => void loadProducts();
    window.addEventListener('oha:reconnected', refresh);
    return () => window.removeEventListener('oha:reconnected', refresh);
  }, [loadProducts]);

  const visibleProducts = useMemo(() => {
    if (manageProducts) return products;
    const query = search.trim().toLocaleLowerCase();
    return products.filter(
      (product) =>
        product.isActive &&
        (filter === 'ALL' || product.category === filter) &&
        (!query || product.name.toLocaleLowerCase().includes(query)),
    );
  }, [filter, manageProducts, products, search]);

  return (
    <>
      <div className="page-heading store-page-heading">
        <div>
          <h2>Store</h2>
          <p>Store products and motel extra charges</p>
        </div>
        {isOwner && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => setManageProducts((value) => !value)}
          >
            <Package size={18} />
            {manageProducts ? 'Back to sales' : 'Manage products'}
          </button>
        )}
      </div>
      {message && (
        <p className="store-feedback" role="status">
          {message}
        </p>
      )}

      {manageProducts ? (
        <ProductManagement
          products={visibleProducts}
          onAdd={() => setEditingProduct('NEW')}
          onEdit={setEditingProduct}
        />
      ) : (
        <>
          <div className="store-toolbar">
            <label className="store-search">
              <Search size={19} aria-hidden="true" />
              <span className="sr-only">Search products</span>
              <input
                type="search"
                placeholder="Search products"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="store-filters" aria-label="Product category">
              {[
                ['ALL', 'All'],
                ['STORE_PRODUCT', 'Store products'],
                ['EXTRA_CHARGE', 'Extra charges'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? 'active' : ''}
                  onClick={() => setFilter(value as typeof filter)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <p className="empty-state">Loading products...</p>
          ) : visibleProducts.length === 0 ? (
            <p className="empty-state">No active products match this view.</p>
          ) : (
            <div className="product-grid">
              {visibleProducts.map((product) => (
                <article className="product-card" key={product.id}>
                  <img
                    src={productImageSource(product.imageUrl)}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      if (event.currentTarget.src.endsWith(fallbackImage))
                        return;
                      event.currentTarget.src = fallbackImage;
                    }}
                  />
                  <div className="product-card-body">
                    <span className="product-category">
                      {product.category === 'STORE_PRODUCT'
                        ? 'Store product'
                        : 'Extra charge'}
                    </span>
                    <h3>{product.name}</h3>
                    <strong>{money(product.sellingPriceCentavos)}</strong>
                    <button
                      type="button"
                      className="primary-button product-purchase-button"
                      onClick={() => setPurchaseProduct(product)}
                    >
                      <ShoppingCart size={19} /> Purchase
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {purchaseProduct && (
        <PurchaseDialog
          product={purchaseProduct}
          rooms={rooms.filter((room) => room.stays.length > 0)}
          onClose={() => setPurchaseProduct(null)}
          onSuccess={(text) => {
            setPurchaseProduct(null);
            setMessage(text);
          }}
        />
      )}
      {editingProduct && (
        <ProductDialog
          product={editingProduct === 'NEW' ? null : editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={async () => {
            setEditingProduct(null);
            await loadProducts();
            setMessage('Product saved successfully.');
          }}
        />
      )}
    </>
  );
}

function ProductManagement({
  products,
  onAdd,
  onEdit,
}: {
  products: Product[];
  onAdd: () => void;
  onEdit: (product: Product) => void;
}) {
  return (
    <section>
      <div className="section-heading product-management-heading">
        <div>
          <h3>Product management</h3>
          <p>Owner-only pricing and availability</p>
        </div>
        <button className="primary-button" type="button" onClick={onAdd}>
          <Plus size={18} /> Add product
        </button>
      </div>
      <div className="product-management-list">
        {products.map((product) => (
          <article
            className={`product-management-item ${product.isActive ? '' : 'inactive'}`}
            key={product.id}
          >
            <img src={productImageSource(product.imageUrl)} alt="" />
            <div>
              <strong>{product.name}</strong>
              <span>
                {product.category === 'STORE_PRODUCT'
                  ? 'Store product'
                  : 'Extra charge'}
              </span>
              <small>{product.isActive ? 'Active' : 'Inactive'}</small>
            </div>
            <b>{money(product.sellingPriceCentavos)}</b>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onEdit(product)}
            >
              <Pencil size={17} /> Edit
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function PurchaseDialog({
  product,
  rooms,
  onClose,
  onSuccess,
}: {
  product: Product;
  rooms: ActiveRoom[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [stayId, setStayId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const total = product.sellingPriceCentavos * quantity;
  const requiresStay = product.category === 'EXTRA_CHARGE';

  async function purchase(): Promise<void> {
    if (requiresStay && !stayId) {
      setMessage('Select an occupied room for this extra charge.');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await apiRequest('/store-sales', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          quantity,
          paymentMethod,
          stayId: stayId ? Number(stayId) : null,
          idempotencyKey,
        }),
      });
      onSuccess(`${quantity} × ${product.name} sold for ${money(total)}.`);
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Purchase could not be completed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog store-purchase-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-title"
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">Confirm purchase</p>
            <h2 id="purchase-title">{product.name}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="purchase-product-summary">
          <img src={productImageSource(product.imageUrl)} alt="" />
          <div>
            <span>Unit price</span>
            <strong>{money(product.sellingPriceCentavos)}</strong>
          </div>
        </div>
        <label className="quantity-field">
          Quantity
          <span>
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            >
              <Minus size={20} />
            </button>
            <output>{quantity}</output>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={quantity >= 100}
              onClick={() => setQuantity((value) => Math.min(100, value + 1))}
            >
              <Plus size={20} />
            </button>
          </span>
        </label>
        <label>
          {requiresStay
            ? 'Occupied room (required)'
            : 'Link to active room (optional)'}
          <select
            value={stayId}
            onChange={(event) => setStayId(event.target.value)}
            aria-required={requiresStay}
          >
            <option value="">
              {requiresStay
                ? 'Select an occupied room'
                : 'Standalone front-desk purchase'}
            </option>
            {rooms.map((room) => (
              <option key={room.id} value={room.stays[0]!.id}>
                Room {room.number}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="segmented-field">
          <legend>Payment</legend>
          <div>
            <button
              type="button"
              className={paymentMethod === 'CASH' ? 'selected' : ''}
              onClick={() => setPaymentMethod('CASH')}
            >
              Cash
            </button>
            <button
              type="button"
              className={paymentMethod === 'GCASH' ? 'selected' : ''}
              onClick={() => setPaymentMethod('GCASH')}
            >
              GCash
            </button>
            <button
              type="button"
              className={paymentMethod === 'CARD' ? 'selected' : ''}
              onClick={() => setPaymentMethod('CARD')}
            >
              Card
            </button>
          </div>
        </fieldset>
        <div className="purchase-total">
          <span>Total</span>
          <strong>{money(total)}</strong>
        </div>
        {message && (
          <p
            className={`form-error ${message === 'Select an occupied room for this extra charge.' ? 'extra-charge-warning' : ''}`}
            role="alert"
          >
            {message}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={submitting}
            onClick={() => void purchase()}
          >
            {submitting ? 'Processing...' : 'Confirm purchase'}
          </button>
        </div>
      </section>
    </div>
  );
}

function ProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState<ProductCategory>(
    product?.category ?? 'STORE_PRODUCT',
  );
  const [price, setPrice] = useState(
    product ? String(product.sellingPriceCentavos / 100) : '',
  );
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<
    string | null
  >(null);
  const imagePreview =
    uploadedImagePreview ?? productImageSource(imageUrl.trim() || null);

  useEffect(() => {
    if (!imageFile) {
      setUploadedImagePreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setUploadedImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  function chooseImage(file: File | undefined): void {
    if (!file) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setMessage('Choose a JPEG, PNG, or WebP image up to 5 MB.');
      return;
    }
    setCropFile(file);
    setMessage(null);
  }

  async function save(): Promise<void> {
    const pesos = Number(price);
    if (!name.trim() || !Number.isFinite(pesos) || pesos <= 0) {
      setMessage('Enter a product name and a price greater than zero.');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      let savedImageUrl = imageUrl.trim() || null;
      if (imageFile) {
        const upload = await apiRequest<{ data: { imageUrl: string } }>(
          '/product-images/upload',
          {
            method: 'POST',
            headers: { 'Content-Type': imageFile.type },
            body: imageFile,
          },
        );
        savedImageUrl = upload.data.imageUrl;
      }
      await apiRequest(product ? `/products/${product.id}` : '/products', {
        method: product ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: name.trim(),
          category,
          sellingPriceCentavos: Math.round(pesos * 100),
          imageUrl: savedImageUrl,
          isActive,
        }),
      });
      await onSaved();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : 'Product could not be saved.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="dialog-backdrop" role="presentation">
        <section
          className="dialog product-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-title"
        >
          <div className="dialog-header">
            <div>
              <p className="dialog-eyebrow">Product management</p>
              <h2 id="product-title">
                {product ? 'Edit product' : 'Add product'}
              </h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <label>
            Product name
            <input
              required
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as ProductCategory)
              }
            >
              <option value="STORE_PRODUCT">Store product</option>
              <option value="EXTRA_CHARGE">Extra charge</option>
            </select>
          </label>
          <label>
            Selling price (PHP)
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
          <div className="product-image-field">
            <span>Product image (optional)</span>
            <div className="product-image-picker">
              <img
                src={imagePreview}
                alt="Product preview"
                onError={(event) => {
                  event.currentTarget.src = fallbackImage;
                }}
              />
              <div>
                <label className="secondary-button file-upload-button">
                  <ImageUp size={18} />
                  {imageFile ? imageFile.name : 'Choose image'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      chooseImage(event.target.files?.[0]);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                {(imageFile || imageUrl) && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImageUrl('');
                    }}
                  >
                    Remove image
                  </button>
                )}
              </div>
            </div>
            <label>
              Or use image URL
              <input
                type="url"
                placeholder="https://..."
                value={imageFile ? '' : imageUrl}
                disabled={imageFile !== null}
                onChange={(event) => setImageUrl(event.target.value)}
              />
            </label>
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />{' '}
            Active and available for purchase
          </label>
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={submitting}
              onClick={() => void save()}
            >
              {submitting ? 'Saving...' : 'Save product'}
            </button>
          </div>
        </section>
      </div>
      {cropFile && (
        <ProductImageCropDialog
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onApply={(croppedFile) => {
            setImageFile(croppedFile);
            setCropFile(null);
            setImageUrl('');
          }}
        />
      )}
    </>
  );
}
