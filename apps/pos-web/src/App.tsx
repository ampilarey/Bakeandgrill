import { useEffect, useMemo, useState } from "react";
import {
  closeShift,
  createOrder,
  createOrderBatch,
  createOrderPayments,
  createPurchase,
  createRefund,
  createSupplier,
  fetchCategories,
  fetchItems,
  fetchInventory,
  fetchRefunds,
  fetchSuppliers,
  getCurrentShift,
  getOrder,
  getSalesSummary,
  holdOrder,
  lookupBarcode,
  openShift,
  previewSmsPromotion,
  resumeOrder,
  adjustInventory,
  createCashMovement,
  fetchTables,
  sendSmsPromotion,
  staffLogin,
} from "./api";
import {
  enqueue,
  getQueue,
  getQueueCount,
  setQueue,
} from "./offlineQueue";
import type {
  CartItem,
  Category,
  Item,
  Modifier,
  RestaurantTable,
} from "./types";

const fallbackCategories: Category[] = [
  { id: 1, name: "Food" },
  { id: 2, name: "Drinks" },
  { id: 3, name: "Dessert" },
];

const fallbackItems: Item[] = [
  {
    id: 101,
    category_id: 1,
    name: "Chicken Burger",
    base_price: 45,
    barcode: "FOOD-001",
    modifiers: [
      { id: 1001, name: "Extra Cheese", price: 5 },
      { id: 1002, name: "No Onion", price: 0 },
    ],
  },
  {
    id: 102,
    category_id: 1,
    name: "French Fries",
    base_price: 20,
    barcode: "FOOD-002",
  },
  {
    id: 201,
    category_id: 2,
    name: "Iced Coffee",
    base_price: 25,
    barcode: "DRINK-001",
    modifiers: [
      { id: 2001, name: "Less Sugar", price: 0 },
      { id: 2002, name: "Extra Cream", price: 3 },
    ],
  },
  {
    id: 301,
    category_id: 3,
    name: "Cheesecake Slice",
    base_price: 30,
    barcode: "DESSERT-001",
  },
];

const orderTypes = ["Dine-in", "Takeaway", "Online Pickup"] as const;

const makeCartKey = (itemId: number, modifiers: Modifier[]) =>
  `${itemId}-${modifiers.map((mod) => mod.id).sort().join(",")}`;

type PaymentRow = {
  id: string;
  method: "cash" | "card" | "digital_wallet";
  amount: string;
};

function App() {
  const today = new Date().toISOString().slice(0, 10);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [viewMode, setViewMode] = useState<"pos" | "ops">("pos");
  const [pin, setPin] = useState("");
  const [deviceId, setDeviceId] = useState("POS-001");
  const [authError, setAuthError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<(typeof orderTypes)[number]>(
    "Takeaway"
  );
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [items, setItems] = useState<Item[]>(fallbackItems);
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    fallbackCategories[0].id
  );
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: crypto.randomUUID(), method: "cash", amount: "" },
  ]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [barcode, setBarcode] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState(getQueueCount());
  const [statusMessage, setStatusMessage] = useState("");
  const [lastHeldOrderId, setLastHeldOrderId] = useState<number | null>(() => {
    const raw = localStorage.getItem("pos_last_held_order");
    return raw ? Number(raw) : null;
  });
  const [shift, setShift] = useState<{
    id: number;
    opened_at: string;
    closed_at: string | null;
    opening_cash: number;
    closing_cash: number | null;
    expected_cash: number | null;
    variance: number | null;
  } | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [cashMoveType, setCashMoveType] = useState<"cash_in" | "cash_out">(
    "cash_in"
  );
  const [cashMoveAmount, setCashMoveAmount] = useState("");
  const [cashMoveReason, setCashMoveReason] = useState("");
  const [reportFrom, setReportFrom] = useState(today);
  const [reportTo, setReportTo] = useState(today);
  const [reportData, setReportData] = useState<{
    totals: {
      orders_count: number;
      subtotal: number;
      tax_amount: number;
      discount_amount: number;
      total: number;
    };
    payments: Record<string, number>;
  } | null>(null);
  const [opsMessage, setOpsMessage] = useState("");
  const [inventoryItems, setInventoryItems] = useState<
    Array<{ id: number; name: string; current_stock: number | null; unit: string }>
  >([]);
  const [adjustItemId, setAdjustItemId] = useState<number | null>(null);
  const [adjustType, setAdjustType] = useState<
    "adjustment" | "waste" | "correction"
  >("adjustment");
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>(
    []
  );
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<number | null>(
    null
  );
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [purchaseItemName, setPurchaseItemName] = useState("");
  const [purchaseQuantity, setPurchaseQuantity] = useState("");
  const [purchaseUnitCost, setPurchaseUnitCost] = useState("");
  const [refundOrderId, setRefundOrderId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunds, setRefunds] = useState<
    Array<{ id: number; amount: number; status: string; reason: string | null; order_id: number }>
  >([]);
  const [promoMessage, setPromoMessage] = useState("");
  const [promoLastOrderDays, setPromoLastOrderDays] = useState("");
  const [promoEstimate, setPromoEstimate] = useState<{
    recipient_count: number;
    segments: number;
    total_cost_mvr: number;
  } | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    setOfflineQueueCount(getQueueCount());
  }, [isOnline]);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    const loadMenu = async () => {
      setIsLoading(true);
      setDataError("");
      try {
        const [categoriesResponse, itemsResponse] = await Promise.all([
          fetchCategories(),
          fetchItems(),
        ]);
        const categoriesData =
          categoriesResponse.length > 0 ? categoriesResponse : fallbackCategories;
        const itemsData = itemsResponse.length > 0 ? itemsResponse : fallbackItems;

        setCategories(categoriesData);
        setItems(itemsData);
        setSelectedCategoryId(categoriesData[0]?.id ?? fallbackCategories[0].id);
      } catch (error) {
        setDataError("Unable to load menu. Using offline cache.");
        setCategories(fallbackCategories);
        setItems(fallbackItems);
      } finally {
        setIsLoading(false);
      }
    };

    loadMenu();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !token) {
      return;
    }

    fetchTables(token)
      .then((response) => {
        setTables(response.tables);
        const available = response.tables.find((table) => table.is_active);
        setSelectedTableId(available?.id ?? null);
      })
      .catch(() => {
        setTables([]);
        setSelectedTableId(null);
      });
  }, [isLoggedIn, token]);

  useEffect(() => {
    if (!isLoggedIn || viewMode !== "ops" || !token) {
      return;
    }

    getCurrentShift(token)
      .then((response) => setShift(response.shift))
      .catch(() => setOpsMessage("Unable to load shift."));

    getSalesSummary(token, { from: reportFrom, to: reportTo })
      .then((response) => setReportData(response))
      .catch(() => setOpsMessage("Unable to load sales summary."));

    fetchInventory(token)
      .then((response) => setInventoryItems(response.items.data))
      .catch(() => setOpsMessage("Unable to load inventory."));

    fetchSuppliers(token)
      .then((response) => setSuppliers(response.suppliers.data))
      .catch(() => setOpsMessage("Unable to load suppliers."));

    fetchRefunds(token)
      .then((response) => setRefunds(response.refunds.data))
      .catch(() => setOpsMessage("Unable to load refunds."));
  }, [isLoggedIn, viewMode, token, reportFrom, reportTo]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => item.category_id === selectedCategoryId);
  }, [items, selectedCategoryId]);

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) =>
          sum +
          (item.price +
            item.modifiers.reduce((modifierTotal, mod) => modifierTotal + mod.price, 0)) *
            item.quantity,
        0
      ),
    [cartItems]
  );

  const handleLogin = async () => {
    setAuthError("");
    if (pin.trim().length < 4) {
      setAuthError("Enter a valid PIN.");
      return;
    }

    try {
      const response = await staffLogin(pin.trim(), deviceId.trim());
      localStorage.setItem("pos_token", response.token);
      setToken(response.token);
      setIsLoggedIn(true);
      setPin("");
    } catch (error) {
      setAuthError("Login failed. Check your PIN.");
    }
  };

  const mapOrderType = (
    type: (typeof orderTypes)[number]
  ): "dine_in" | "takeaway" | "online_pickup" => {
    if (type === "Dine-in") {
      return "dine_in";
    }
    if (type === "Online Pickup") {
      return "online_pickup";
    }
    return "takeaway";
  };

  const handleSelectItem = (item: Item) => {
    setSelectedItem(item);
    setSelectedModifiers([]);
  };

  const toggleModifier = (modifier: Modifier) => {
    setSelectedModifiers((current) => {
      const exists = current.find((mod) => mod.id === modifier.id);
      if (exists) {
        return current.filter((mod) => mod.id !== modifier.id);
      }
      return [...current, modifier];
    });
  };

  const addToCart = (item: Item) => {
    const modifiers = selectedItem?.id === item.id ? selectedModifiers : [];
    const itemKey = makeCartKey(item.id, modifiers);
    setCartItems((current) => {
      const existing = current.find(
        (cartItem) => makeCartKey(cartItem.id, cartItem.modifiers) === itemKey
      );
      if (existing) {
        return current.map((cartItem) =>
          cartItem === existing
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }
      return [
        ...current,
        {
          id: item.id,
          name: item.name,
          price: item.base_price,
          quantity: 1,
          modifiers,
        },
      ];
    });
  };

  const updateQuantity = (itemKey: string, delta: number) => {
    setCartItems((current) =>
      current
        .map((item) =>
          makeCartKey(item.id, item.modifiers) === itemKey
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleBarcodeSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedBarcode = barcode.trim();
    if (!trimmedBarcode) {
      return;
    }

    const fallbackMatch = items.find((item) => item.barcode === trimmedBarcode);

    if (isOnline) {
      lookupBarcode(trimmedBarcode)
        .then((item) => {
          if (item) {
            addToCart(item);
            setBarcode("");
            return;
          }
          if (fallbackMatch) {
            addToCart(fallbackMatch);
            setBarcode("");
          }
        })
        .catch(() => {
          if (fallbackMatch) {
            addToCart(fallbackMatch);
            setBarcode("");
          }
        });
      return;
    }

    if (fallbackMatch) {
      addToCart(fallbackMatch);
      setBarcode("");
    }
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      return;
    }
    if (orderType === "Dine-in" && !selectedTableId) {
      setStatusMessage("Select a table for dine-in orders.");
      return;
    }

    const discount = Math.max(0, Number.parseFloat(discountAmount) || 0);
    const payload = {
      type: mapOrderType(orderType),
      print: true,
      device_identifier: deviceId,
      restaurant_table_id:
        orderType === "Dine-in" ? selectedTableId ?? undefined : undefined,
      discount_amount: discount,
      items: cartItems.map((item) => ({
        item_id: item.id,
        name: item.name,
        quantity: item.quantity,
        modifiers: item.modifiers.map((mod) => ({
          modifier_id: mod.id,
          name: mod.name,
          price: mod.price,
        })),
      })),
    };

    if (isOnline && token) {
      createOrder(token, payload)
        .then((response) => {
          const parsedPayments = payments
            .map((payment) => ({
              method: payment.method,
              amount: Number.parseFloat(payment.amount),
            }))
            .filter((payment) => Number.isFinite(payment.amount) && payment.amount > 0);

          const totalDue = response.order.total ?? cartTotal;
          const paidTotal = parsedPayments.reduce(
            (sum, payment) => sum + payment.amount,
            0
          );
          const finalPayments = [...parsedPayments];

          if (finalPayments.length === 0) {
            finalPayments.push({ method: "cash", amount: totalDue });
          } else if (paidTotal < totalDue) {
            finalPayments.push({ method: "cash", amount: totalDue - paidTotal });
          }

          return createOrderPayments(token, response.order.id, {
            payments: finalPayments,
            print_receipt: true,
          });
        })
        .then(() => {
          setCartItems([]);
          setSelectedItem(null);
          setSelectedModifiers([]);
          setDiscountAmount("");
          setPayments([{ id: crypto.randomUUID(), method: "cash", amount: "" }]);
          setStatusMessage("Order paid and sent to kitchen.");
        })
        .catch(() => {
          enqueue(payload);
          setOfflineQueueCount(getQueueCount());
          setStatusMessage("Network error. Order queued for sync.");
        });
      return;
    }

    enqueue(payload);
    setOfflineQueueCount(getQueueCount());
    setCartItems([]);
    setSelectedItem(null);
    setSelectedModifiers([]);
    setDiscountAmount("");
    setPayments([{ id: crypto.randomUUID(), method: "cash", amount: "" }]);
    setStatusMessage("Offline order queued. Sync when online.");
  };

  const handleHoldOrder = () => {
    if (!isOnline || !token) {
      setStatusMessage("Go online and login to hold orders.");
      return;
    }
    if (cartItems.length === 0) {
      return;
    }
    if (orderType === "Dine-in" && !selectedTableId) {
      setStatusMessage("Select a table for dine-in orders.");
      return;
    }

    const discount = Math.max(0, Number.parseFloat(discountAmount) || 0);
    const payload = {
      type: mapOrderType(orderType),
      print: false,
      device_identifier: deviceId,
      restaurant_table_id:
        orderType === "Dine-in" ? selectedTableId ?? undefined : undefined,
      discount_amount: discount,
      items: cartItems.map((item) => ({
        item_id: item.id,
        name: item.name,
        quantity: item.quantity,
        modifiers: item.modifiers.map((mod) => ({
          modifier_id: mod.id,
          name: mod.name,
          price: mod.price,
        })),
      })),
    };

    createOrder(token, payload)
      .then((response) => {
        return holdOrder(token, response.order.id).then(() => response.order.id);
      })
      .then((orderId) => {
        localStorage.setItem("pos_last_held_order", String(orderId));
        setLastHeldOrderId(orderId);
        setCartItems([]);
        setSelectedItem(null);
        setSelectedModifiers([]);
        setDiscountAmount("");
        setStatusMessage(`Order ${orderId} held.`);
      })
      .catch(() => {
        setStatusMessage("Unable to hold order. Try again.");
      });
  };

  const handleResumeLastHold = () => {
    if (!isOnline || !token || !lastHeldOrderId) {
      return;
    }

    resumeOrder(token, lastHeldOrderId)
      .then(() => getOrder(token, lastHeldOrderId))
      .then((response) => {
        const restoredItems: CartItem[] = response.order.items.map((item) => ({
          id: item.item_id ?? 0,
          name: item.item_name,
          price: item.unit_price,
          quantity: item.quantity,
          modifiers:
            item.modifiers?.map((mod) => ({
              id: mod.modifier_id ?? 0,
              name: mod.modifier_name,
              price: mod.modifier_price,
            })) ?? [],
        }));
        setCartItems(restoredItems);
        setSelectedItem(null);
        setSelectedModifiers([]);
        setStatusMessage("Held order resumed.");
      })
      .catch(() => {
        setStatusMessage("Unable to resume held order.");
      });
  };

  const addPaymentRow = () => {
    setPayments((current) => [
      ...current,
      { id: crypto.randomUUID(), method: "cash", amount: "" },
    ]);
  };

  const updatePaymentRow = (id: string, changes: Partial<PaymentRow>) => {
    setPayments((current) =>
      current.map((payment) =>
        payment.id === id ? { ...payment, ...changes } : payment
      )
    );
  };

  const removePaymentRow = (id: string) => {
    setPayments((current) => current.filter((payment) => payment.id !== id));
  };

  const handleOpenShift = () => {
    if (!token) {
      return;
    }
    const openingValue = Number.parseFloat(openingCash);
    if (!Number.isFinite(openingValue)) {
      setOpsMessage("Enter a valid opening cash amount.");
      return;
    }

    openShift(token, { opening_cash: openingValue })
      .then(() => {
        setOpsMessage("Shift opened.");
        setOpeningCash("");
        return getCurrentShift(token);
      })
      .then((response) => setShift(response.shift))
      .catch(() => setOpsMessage("Unable to open shift."));
  };

  const handleCloseShift = () => {
    if (!token || !shift) {
      return;
    }
    const closingValue = Number.parseFloat(closingCash);
    if (!Number.isFinite(closingValue)) {
      setOpsMessage("Enter a valid closing cash amount.");
      return;
    }

    closeShift(token, shift.id, { closing_cash: closingValue })
      .then(() => {
        setOpsMessage("Shift closed.");
        setClosingCash("");
        setShift(null);
      })
      .catch(() => setOpsMessage("Unable to close shift."));
  };

  const handleCashMovement = () => {
    if (!token || !shift) {
      return;
    }
    const amountValue = Number.parseFloat(cashMoveAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setOpsMessage("Enter a valid cash movement amount.");
      return;
    }
    if (!cashMoveReason.trim()) {
      setOpsMessage("Add a reason for the cash movement.");
      return;
    }

    createCashMovement(token, shift.id, {
      type: cashMoveType,
      amount: amountValue,
      reason: cashMoveReason.trim(),
    })
      .then(() => {
        setOpsMessage("Cash movement recorded.");
        setCashMoveAmount("");
        setCashMoveReason("");
      })
      .catch(() => setOpsMessage("Unable to record cash movement."));
  };

  const handleLoadReport = () => {
    if (!token) {
      return;
    }
    getSalesSummary(token, { from: reportFrom, to: reportTo })
      .then((response) => setReportData(response))
      .catch(() => setOpsMessage("Unable to load sales summary."));
  };

  const handleAdjustInventory = () => {
    if (!token || !adjustItemId) {
      return;
    }
    const quantity = Number.parseFloat(adjustQuantity);
    if (!Number.isFinite(quantity)) {
      setOpsMessage("Enter a valid adjustment quantity.");
      return;
    }
    adjustInventory(token, adjustItemId, {
      quantity,
      type: adjustType,
      notes: adjustNotes || undefined,
    })
      .then(() => {
        setOpsMessage("Inventory updated.");
        setAdjustQuantity("");
        setAdjustNotes("");
        return fetchInventory(token);
      })
      .then((response) => setInventoryItems(response.items.data))
      .catch(() => setOpsMessage("Unable to adjust inventory."));
  };

  const handleCreateSupplier = () => {
    if (!token || !newSupplierName.trim()) {
      return;
    }
    createSupplier(token, {
      name: newSupplierName.trim(),
      phone: newSupplierPhone || undefined,
    })
      .then(() => {
        setNewSupplierName("");
        setNewSupplierPhone("");
        setOpsMessage("Supplier added.");
        return fetchSuppliers(token);
      })
      .then((response) => setSuppliers(response.suppliers.data))
      .catch(() => setOpsMessage("Unable to add supplier."));
  };

  const handleCreatePurchase = () => {
    if (!token || !purchaseItemName.trim()) {
      return;
    }
    const quantity = Number.parseFloat(purchaseQuantity);
    const unitCost = Number.parseFloat(purchaseUnitCost);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) {
      setOpsMessage("Enter valid purchase quantity and unit cost.");
      return;
    }
    createPurchase(token, {
      supplier_id: purchaseSupplierId ?? undefined,
      purchase_date: purchaseDate,
      items: [
        {
          name: purchaseItemName.trim(),
          quantity,
          unit_cost: unitCost,
        },
      ],
    })
      .then(() => {
        setPurchaseItemName("");
        setPurchaseQuantity("");
        setPurchaseUnitCost("");
        setOpsMessage("Purchase recorded.");
        return fetchInventory(token);
      })
      .then((response) => setInventoryItems(response.items.data))
      .catch(() => setOpsMessage("Unable to record purchase."));
  };

  const handleCreateRefund = () => {
    if (!token) {
      return;
    }
    const orderId = Number.parseInt(refundOrderId, 10);
    const amount = Number.parseFloat(refundAmount);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setOpsMessage("Enter a valid order ID.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setOpsMessage("Enter a valid refund amount.");
      return;
    }

    createRefund(token, orderId, {
      amount,
      reason: refundReason || undefined,
    })
      .then(() => {
        setRefundOrderId("");
        setRefundAmount("");
        setRefundReason("");
        setOpsMessage("Refund recorded.");
        return fetchRefunds(token);
      })
      .then((response) => setRefunds(response.refunds.data))
      .catch(() => setOpsMessage("Unable to record refund."));
  };

  const handlePreviewPromotion = () => {
    if (!token || !promoMessage.trim()) {
      setOpsMessage("Enter a promotion message.");
      return;
    }
    const lastOrderDays = promoLastOrderDays
      ? Number.parseInt(promoLastOrderDays, 10)
      : undefined;

    previewSmsPromotion(token, {
      message: promoMessage.trim(),
      filters: {
        last_order_days: Number.isFinite(lastOrderDays) ? lastOrderDays : undefined,
      },
    })
      .then((response) => {
        setPromoEstimate({
          recipient_count: response.estimate.recipient_count,
          segments: response.estimate.segments,
          total_cost_mvr: response.estimate.total_cost_mvr,
        });
      })
      .catch(() => setOpsMessage("Unable to preview SMS promotion."));
  };

  const handleSendPromotion = () => {
    if (!token || !promoMessage.trim()) {
      setOpsMessage("Enter a promotion message.");
      return;
    }
    const lastOrderDays = promoLastOrderDays
      ? Number.parseInt(promoLastOrderDays, 10)
      : undefined;

    sendSmsPromotion(token, {
      name: "POS Promotion",
      message: promoMessage.trim(),
      filters: {
        last_order_days: Number.isFinite(lastOrderDays) ? lastOrderDays : undefined,
      },
    })
      .then(() => {
        setOpsMessage("Promotion SMS queued.");
        setPromoMessage("");
        setPromoLastOrderDays("");
        setPromoEstimate(null);
      })
      .catch(() => setOpsMessage("Unable to send promotion SMS."));
  };

  const handleSyncQueue = () => {
    if (!isOnline) {
      setStatusMessage("You are offline. Sync paused.");
      return;
    }

    if (!token) {
      setStatusMessage("Login required to sync.");
      return;
    }

    const queue = getQueue();
    if (queue.length === 0) {
      setStatusMessage("No queued orders to sync.");
      return;
    }

    createOrderBatch(token, {
      orders: queue.map((entry) => entry.payload as {
        type: string;
        print?: boolean;
        device_identifier?: string;
        restaurant_table_id?: number | null;
        discount_amount?: number;
        items: Array<{
          item_id?: number | null;
          name: string;
          quantity: number;
          modifiers?: Array<{
            modifier_id?: number | null;
            name: string;
            price: number;
          }>;
        }>;
      }),
    })
      .then((result) => {
        if (!result.failed || result.failed.length === 0) {
          setQueue([]);
          setOfflineQueueCount(0);
          setStatusMessage(`Synced ${result.processed} orders.`);
          return;
        }

        const failedIndexes = new Set(result.failed.map((item) => item.index));
        const remaining = queue.filter((_, index) => failedIndexes.has(index));
        setQueue(remaining);
        setOfflineQueueCount(remaining.length);
        setStatusMessage(
          `Synced ${result.processed} orders, ${remaining.length} failed.`
        );
      })
      .catch(() => {
        setStatusMessage("Sync failed. Try again.");
      });
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-semibold text-slate-900">
            Bake & Grill POS
          </h1>
          <p className="text-slate-500 mt-1">PIN login for staff</p>
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Device ID
            </label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
            />
            <label className="block text-sm font-medium text-slate-700">
              PIN
            </label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
            <button
              className="w-full rounded-lg bg-orange-600 text-white py-2 font-semibold hover:bg-orange-700 transition"
              onClick={handleLogin}
            >
              Login
            </button>
            {authError && (
              <p className="text-sm text-rose-600">{authError}</p>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-6">
            Demo PINs: Owner(1111), Admin(2222), Manager(3333), Cashier(4444)<br/>
            Device ID: Use "POS-001" or any identifier
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Bake & Grill POS</h1>
          <p className="text-sm text-slate-500">Device {deviceId}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                viewMode === "pos"
                  ? "bg-white text-slate-900 shadow"
                  : "text-slate-500"
              }`}
              onClick={() => setViewMode("pos")}
            >
              POS
            </button>
            <button
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                viewMode === "ops"
                  ? "bg-white text-slate-900 shadow"
                  : "text-slate-500"
              }`}
              onClick={() => setViewMode("ops")}
            >
              Ops
            </button>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isOnline ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}
          >
            {isOnline ? "Online" : "Offline"}
          </span>
          <span className="text-xs text-slate-500">
            Offline queue: {offlineQueueCount}
          </span>
          <button
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            onClick={handleSyncQueue}
          >
            Sync
          </button>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-4 p-6">
        {statusMessage && (
          <div className="col-span-12">
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
              {statusMessage}
            </div>
          </div>
        )}
        {opsMessage && (
          <div className="col-span-12">
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
              {opsMessage}
            </div>
          </div>
        )}
        {viewMode === "ops" ? (
          <>
            <section className="col-span-6 space-y-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">Shift</h2>
                {shift ? (
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p>Opened: {new Date(shift.opened_at).toLocaleString()}</p>
                    <p>Opening Cash: MVR {shift.opening_cash.toFixed(2)}</p>
                    {shift.closed_at ? (
                      <>
                        <p>Closed: {new Date(shift.closed_at).toLocaleString()}</p>
                        <p>Expected Cash: MVR {shift.expected_cash?.toFixed(2)}</p>
                        <p>Variance: MVR {shift.variance?.toFixed(2)}</p>
                      </>
                    ) : (
                      <>
                        <label className="block text-xs text-slate-500">
                          Closing Cash
                        </label>
                        <input
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          value={closingCash}
                          onChange={(event) => setClosingCash(event.target.value)}
                          placeholder="0.00"
                        />
                        <button
                          className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-semibold"
                          onClick={handleCloseShift}
                        >
                          Close Shift
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs text-slate-500">
                      Opening Cash
                    </label>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={openingCash}
                      onChange={(event) => setOpeningCash(event.target.value)}
                      placeholder="0.00"
                    />
                    <button
                      className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-semibold"
                      onClick={handleOpenShift}
                    >
                      Open Shift
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">Cash In/Out</h2>
                <div className="mt-3 space-y-2">
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={cashMoveType}
                    onChange={(event) =>
                      setCashMoveType(event.target.value as "cash_in" | "cash_out")
                    }
                  >
                    <option value="cash_in">Cash In</option>
                    <option value="cash_out">Cash Out</option>
                  </select>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Amount"
                    value={cashMoveAmount}
                    onChange={(event) => setCashMoveAmount(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Reason"
                    value={cashMoveReason}
                    onChange={(event) => setCashMoveReason(event.target.value)}
                  />
                  <button
                    className="w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
                    onClick={handleCashMovement}
                  >
                    Record Movement
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">Inventory</h2>
                <div className="mt-3 space-y-2">
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={adjustItemId ?? ""}
                    onChange={(event) =>
                      setAdjustItemId(
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                  >
                    <option value="">Select item</option>
                    {inventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.current_stock ?? 0} {item.unit})
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={adjustType}
                    onChange={(event) =>
                      setAdjustType(
                        event.target.value as "adjustment" | "waste" | "correction"
                      )
                    }
                  >
                    <option value="adjustment">Adjustment</option>
                    <option value="waste">Waste</option>
                    <option value="correction">Correction</option>
                  </select>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Quantity (+/-)"
                    value={adjustQuantity}
                    onChange={(event) => setAdjustQuantity(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Notes"
                    value={adjustNotes}
                    onChange={(event) => setAdjustNotes(event.target.value)}
                  />
                  <button
                    className="w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
                    onClick={handleAdjustInventory}
                  >
                    Save Adjustment
                  </button>
                </div>
              </div>
            </section>

            <section className="col-span-6 space-y-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">Sales Summary</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={reportFrom}
                    onChange={(event) => setReportFrom(event.target.value)}
                  />
                  <input
                    type="date"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={reportTo}
                    onChange={(event) => setReportTo(event.target.value)}
                  />
                </div>
                <button
                  className="w-full mt-3 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
                  onClick={handleLoadReport}
                >
                  Load Summary
                </button>
                {reportData && (
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>Orders: {reportData.totals.orders_count}</p>
                    <p>Subtotal: MVR {reportData.totals.subtotal.toFixed(2)}</p>
                    <p>Tax: MVR {reportData.totals.tax_amount.toFixed(2)}</p>
                    <p>Discounts: MVR {reportData.totals.discount_amount.toFixed(2)}</p>
                    <p>Total: MVR {reportData.totals.total.toFixed(2)}</p>
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-slate-500">
                        Payments
                      </p>
                      {Object.entries(reportData.payments).map(([method, amount]) => (
                        <p key={method}>
                          {method}: MVR {amount.toFixed(2)}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">Suppliers</h2>
                <div className="mt-3 space-y-2">
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Supplier name"
                    value={newSupplierName}
                    onChange={(event) => setNewSupplierName(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Phone (optional)"
                    value={newSupplierPhone}
                    onChange={(event) => setNewSupplierPhone(event.target.value)}
                  />
                  <button
                    className="w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
                    onClick={handleCreateSupplier}
                  >
                    Add Supplier
                  </button>
                  {suppliers.length > 0 && (
                    <div className="text-xs text-slate-500">
                      {suppliers.map((supplier) => supplier.name).join(", ")}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">New Purchase</h2>
                <div className="mt-3 space-y-2">
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={purchaseSupplierId ?? ""}
                    onChange={(event) =>
                      setPurchaseSupplierId(
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                  >
                    <option value="">Select supplier (optional)</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={purchaseDate}
                    onChange={(event) => setPurchaseDate(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Item name"
                    value={purchaseItemName}
                    onChange={(event) => setPurchaseItemName(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Quantity"
                    value={purchaseQuantity}
                    onChange={(event) => setPurchaseQuantity(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Unit cost"
                    value={purchaseUnitCost}
                    onChange={(event) => setPurchaseUnitCost(event.target.value)}
                  />
                  <button
                    className="w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
                    onClick={handleCreatePurchase}
                  >
                    Record Purchase
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">Refunds</h2>
                <div className="mt-3 space-y-2">
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Order ID"
                    value={refundOrderId}
                    onChange={(event) => setRefundOrderId(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Amount"
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Reason (optional)"
                    value={refundReason}
                    onChange={(event) => setRefundReason(event.target.value)}
                  />
                  <button
                    className="w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
                    onClick={handleCreateRefund}
                  >
                    Record Refund
                  </button>
                  {refunds.length > 0 && (
                    <div className="text-xs text-slate-500 space-y-1">
                      {refunds.slice(0, 3).map((refund) => (
                        <div key={refund.id}>
                          Order {refund.order_id}: MVR {refund.amount.toFixed(2)} ({refund.status})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">SMS Promotions</h2>
                <div className="mt-3 space-y-2">
                  <textarea
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    rows={4}
                    placeholder="Promotion message"
                    value={promoMessage}
                    onChange={(event) => setPromoMessage(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Active in last X days (optional)"
                    value={promoLastOrderDays}
                    onChange={(event) => setPromoLastOrderDays(event.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
                      onClick={handlePreviewPromotion}
                    >
                      Preview
                    </button>
                    <button
                      className="rounded-lg bg-slate-900 text-white py-2 text-sm font-semibold"
                      onClick={handleSendPromotion}
                    >
                      Send SMS
                    </button>
                  </div>
                  {promoEstimate && (
                    <div className="text-xs text-slate-500">
                      {promoEstimate.recipient_count} recipients ·{" "}
                      {promoEstimate.segments} segments · Est. MVR{" "}
                      {promoEstimate.total_cost_mvr.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : (
        <>
        <section className="col-span-2 space-y-3">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-700">Order Type</p>
            <div className="mt-3 space-y-2">
              {orderTypes.map((type) => (
                <button
                  key={type}
                  className={`w-full rounded-lg px-3 py-2 text-sm font-medium ${
                    orderType === type
                      ? "bg-orange-100 text-orange-700 border border-orange-200"
                      : "bg-slate-50 text-slate-600 border border-slate-200"
                  }`}
                  onClick={() => setOrderType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
            {orderType === "Dine-in" && (
              <div className="mt-4 space-y-2">
                <label className="block text-xs text-slate-500">Table</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={selectedTableId ?? ""}
                  onChange={(event) =>
                    setSelectedTableId(
                      event.target.value ? Number(event.target.value) : null
                    )
                  }
                >
                  <option value="">Select table</option>
                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name} ({table.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-700">Categories</p>
            <div className="mt-3 space-y-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`w-full rounded-lg px-3 py-2 text-sm font-medium ${
                    selectedCategoryId === category.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-50 text-slate-700"
                  }`}
                  onClick={() => setSelectedCategoryId(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="col-span-7 space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Scan barcode or type SKU"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
              />
              <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm">
                Add
              </button>
            </form>
          </div>
          {dataError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
              {dataError}
            </div>
          )}
          {isLoading && (
            <div className="bg-white rounded-xl px-4 py-3 text-sm text-slate-500 shadow-sm">
              Loading menu...
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition text-left"
                onClick={() => handleSelectItem(item)}
              >
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-slate-500">
                  MVR {item.base_price.toFixed(2)}
                </p>
              </button>
            ))}
          </div>
          {selectedItem && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{selectedItem.name}</p>
                  <p className="text-sm text-slate-500">
                    MVR {selectedItem.base_price.toFixed(2)}
                  </p>
                </div>
                <button
                  className="rounded-lg bg-orange-600 text-white px-4 py-2 text-sm"
                  onClick={() => addToCart(selectedItem)}
                >
                  Add to cart
                </button>
              </div>
              {selectedItem.modifiers && selectedItem.modifiers.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-slate-700">Modifiers</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedItem.modifiers.map((modifier) => {
                      const active = selectedModifiers.some((m) => m.id === modifier.id);
                      return (
                        <button
                          key={modifier.id}
                          className={`rounded-full px-3 py-1 text-sm border ${
                            active
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-slate-50 text-slate-700 border-slate-200"
                          }`}
                          onClick={() => toggleModifier(modifier)}
                        >
                          {modifier.name}
                          {modifier.price > 0 ? ` +${modifier.price}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="col-span-3">
          <div className="bg-white rounded-xl p-4 shadow-sm h-full flex flex-col">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Cart</p>
              <button
                className="text-xs text-slate-500 hover:text-slate-800"
                onClick={() => {
                  setCartItems([]);
                  setPayments([{ id: crypto.randomUUID(), method: "cash", amount: "" }]);
                }}
              >
                Clear
              </button>
            </div>
            <div className="mt-4 flex-1 space-y-3 overflow-auto">
              {cartItems.length === 0 && (
                <p className="text-sm text-slate-400">No items yet.</p>
              )}
              {cartItems.map((item) => {
                const itemKey = makeCartKey(item.id, item.modifiers);
                return (
                  <div key={itemKey}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.modifiers.length > 0 && (
                        <p className="text-xs text-slate-500">
                          {item.modifiers.map((mod) => mod.name).join(", ")}
                        </p>
                      )}
                    </div>
                    <p className="text-sm">MVR {item.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        className="h-7 w-7 rounded-full border border-slate-200"
                        onClick={() => updateQuantity(itemKey, -1)}
                      >
                        -
                      </button>
                      <span className="text-sm">{item.quantity}</span>
                      <button
                        className="h-7 w-7 rounded-full border border-slate-200"
                        onClick={() => updateQuantity(itemKey, 1)}
                      >
                        +
                      </button>
                    </div>
                    <p className="text-sm font-semibold">
                      MVR {(item.price + item.modifiers.reduce((m, mod) => m + mod.price, 0)) * item.quantity}
                    </p>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="border-t border-slate-200 pt-3 mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Payments</span>
                <button
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  onClick={addPaymentRow}
                >
                  Add split
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {payments.map((payment, index) => (
                  <div key={payment.id} className="flex items-center gap-2">
                    <select
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                      value={payment.method}
                      onChange={(event) =>
                        updatePaymentRow(payment.id, {
                          method: event.target.value as PaymentRow["method"],
                        })
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="digital_wallet">Wallet</option>
                    </select>
                    <input
                      className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
                      placeholder="Amount"
                      value={payment.amount}
                      onChange={(event) =>
                        updatePaymentRow(payment.id, { amount: event.target.value })
                      }
                    />
                    {index > 0 && (
                      <button
                        className="text-xs text-slate-400 hover:text-slate-700"
                        onClick={() => removePaymentRow(payment.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-slate-500">Discount (MVR)</span>
                <input
                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm text-right"
                  placeholder="0"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm text-slate-500">Total</span>
                <span className="text-lg font-semibold">MVR {cartTotal.toFixed(2)}</span>
              </div>
              {lastHeldOrderId && (
                <div className="mt-2 text-xs text-slate-500">
                  Last held order: {lastHeldOrderId}
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  className="rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600"
                  onClick={handleHoldOrder}
                >
                  Hold
                </button>
                <button
                  className="rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600"
                  onClick={handleResumeLastHold}
                >
                  Resume
                </button>
              </div>
              <button
                className="w-full mt-3 rounded-lg bg-emerald-600 text-white py-2 font-semibold"
                onClick={handleCheckout}
              >
                Checkout
              </button>
            </div>
          </div>
        </section>
        </>
        )}
      </main>
    </div>
  );
}

export default App;
