(namespace "free")

(enforce-keyset (read-keyset 'admin-keyset))
(define-keyset "free.dia-admin-keyset" (read-keyset 'admin-keyset))

(module dia-oracle GOVERNANCE
  @doc "DIA key/value oracle with support for multiple updates in a single tx"

  @model
    [ (defproperty admin-authorized (authorized-by ADMIN_KEYSET))
    ]

  (defconst ADMIN_KEYSET "free.dia-admin-keyset")
  (defconst UNIX_EPOCH (parse-time "%s" "0") "Zero Unix epoch")

  (defschema value-schema
    timestamp:time
    value:decimal)

  (deftable storage:{value-schema})

  (defcap GOVERNANCE ()
    "Module governance capability that only allows the admin to update this oracle"
    (enforce-keyset ADMIN_KEYSET))

  (defcap STORAGE ()
    "Magic capability to protect oracle data storage"
    true)

  (defcap ADMIN ()
    "Capability that only allows the module admin to update oracle storage"
    (compose-capability (GOVERNANCE))
    (compose-capability (STORAGE))
  )

  (defcap UPDATE (key:string timestamp:time value:decimal)
    "Event that indicates an update in oracle data"
    @event true
  )

  (defun get-value:object{value-schema} (key:string)
    "Read a value stored at key"

    (with-default-read storage key
      { "timestamp": UNIX_EPOCH, "value": 0.0 }
      { "timestamp" := t, "value" := v }
      { "timestamp": t, "value": v }
    )
  )

  (defun set-value (key:string timestamp:time value:decimal)
    @doc "Update a single oracle value"
    @model [(property admin-authorized)]

    (with-capability (ADMIN) (update-value key timestamp value))
  )

  (defun set-multiple-values (keys:[string] timestamps:[time] values:[decimal])
    "Update multiple oracle values"

    (enforce (and
      (= (length keys) (length timestamps))
      (= (length keys) (length values)))
      "Input lengths should be equal")

    (with-capability (ADMIN)
      (map
        (lambda (i) (update-value (at i keys) (at i timestamps) (at i values)))
        (enumerate 0 (- (length keys) 1)))
    )
  )

  (defun update-value (key:string timestamp:time value:decimal)
    "Update the value stored at key. Can only be used from within the module."

    (require-capability (STORAGE))
    (enforce
      (>= (diff-time timestamp UNIX_EPOCH) 0.0)
      "Timestamp should be positive")

    (write storage key { "timestamp": timestamp, "value": value })
    (emit-event (UPDATE key timestamp value))
  )
)

(if (read-msg "upgrade")
  ["upgrade"]
  [
    (create-table storage)
  ]
)
