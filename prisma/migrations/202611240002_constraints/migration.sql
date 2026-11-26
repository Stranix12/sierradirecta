ALTER TABLE "User" ADD CONSTRAINT user_role CHECK (role IN ('admin','lider','comprador','precios'));
ALTER TABLE "Lot" ADD CONSTRAINT lot_stock CHECK (stock >= 0 AND reserved >= 0 AND reserved <= stock), ADD CONSTRAINT lot_price CHECK (price > 0), ADD CONSTRAINT lot_dates CHECK (harvest <= available);
ALTER TABLE "OrderItem" ADD CONSTRAINT item_positive CHECK (quantity > 0 AND price > 0);
ALTER TABLE "Reference" ADD CONSTRAINT reference_values CHECK (min > 0 AND max >= min AND "kgPerUnit" > 0 AND "originalMin" > 0 AND "originalMax" >= "originalMin");
ALTER TABLE "Order" ADD CONSTRAINT order_status CHECK (status IN ('pendiente','aceptado','en preparación','listo para entrega','entregado','rechazado','cancelado'));
