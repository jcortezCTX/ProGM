-- AlterTable
ALTER TABLE "inventory_transactions" ADD COLUMN     "delivery_line_item_id" UUID;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_delivery_line_item_id_fkey" FOREIGN KEY ("delivery_line_item_id") REFERENCES "delivery_line_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

