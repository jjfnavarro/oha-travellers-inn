# Mini Store and Extra Charges

The Mini Store records paid store products and motel extra charges without adding inventory, cost, profit, discounts, refunds, or payment adjustments.

## Permissions

- Owner and Front Desk accounts can record Cash and GCash purchases.
- Only the Owner can create, edit, activate, or deactivate products and access financial Reports.
- These rules are enforced by the server. Hidden client controls are not authorization.

## Purchase Flow

Staff selects one active product, sets a quantity, optionally links an active room stay, selects Cash or GCash, and confirms payment. The server reloads the active product and calculates the authoritative total from its current selling price. The sale, item snapshot, financial transaction, and audit record are committed together.

Each purchase request carries a UUID idempotency key. Repeating the same request returns the original sale instead of charging twice. Failed or offline requests are never queued as successful transactions.

## Historical Accuracy

Sale items preserve the name, category, price, quantity, and line total used at payment time. Changing or deactivating a product does not change previous sales or reports. Financial transactions remain the authoritative money ledger.

## Images

The Owner can upload a JPEG, PNG, or WebP image up to 5 MB or provide an HTTP/HTTPS image URL. New uploads open a touch-friendly square cropper with drag positioning, zoom, 90-degree rotation, reset, and preview controls. The applied crop is compressed to an 800-by-800 WebP image before upload. Uploaded files use safe generated names in `PRODUCT_IMAGE_DIR`; MySQL stores only the resulting path. The bundled OHA logo appears when no usable image is available.

For production, point `PRODUCT_IMAGE_DIR` at a persistent mounted disk, or replace the local upload adapter with durable managed object storage. Ephemeral deployment storage will lose uploads during a restart or redeploy.

## Reporting

The Owner Reports page provides Overall, Rooms, and Store report types with shared period, shift, staff, and Cash/GCash filters. It includes revenue trend and source-breakdown charts, product and staff breakdowns, activity, PDF charts, Excel trend data, and browser printing.

## Deferred Scope

Inventory quantities, low-stock alerts, supplier data, purchase cost, profit, discounts, refunds, adjustments, expenses, and other income require separate approved milestones.
