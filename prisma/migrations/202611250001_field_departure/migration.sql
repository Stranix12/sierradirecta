ALTER TABLE "Order" DROP CONSTRAINT order_status;
ALTER TABLE "Order" ADD CONSTRAINT order_status CHECK (status IN ('pendiente','aceptado','en preparación','salió del campo','listo para entrega','entregado','rechazado','cancelado'));
