(namespace 'free)

(enforce-keyset (read-keyset 'dia-admin-keyset))
(define-keyset "free.dia-admin-keyset" (read-keyset 'dia-admin-keyset))

(module dia-oracle GOVERNANCE
  @doc "DIA key/value oracle with support for multiple updates in a single tx"

  @model
    [ (defproperty admin-authorized (authorized-by "free.dia-admin-keyset"))
    ]

  (defconst UNIX_EPOCH (parse-time "%s" "0") "Zero Unix epoch")

  (defschema value-schema
    timestamp:time
    value:decimal)

  (deftable storage:{value-schema})

  (defcap GOVERNANCE ()
    "Module governance capability that only allows the admin to update this oracle"
    (enforce-keyset "free.dia-admin-keyset"))

  (defcap STORAGE ()
    "Magic capability to protect oracle data storage"
    true)

  (defcap ADMIN ()
    "Capability that only allows the module admin to update oracle storage"
    (compose-capability (GOVERNANCE))
    (compose-capability (STORAGE))
  )

  (defcap UPDATE (key:string value:object{value-schema})
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

    (with-capability (ADMIN)
      (update-value key { "timestamp": timestamp, "value": value })
    )
  )

  (defun set-multiple-values (keys:[string] values:[object{value-schema}])
    @doc "Update multiple oracle values"
    @model
      [ (property admin-authorized)
        (property (= (length keys) (length values)))
      ]

    (enforce (= (length keys) (length values)) "Input lengths should be equal")
    (with-capability (ADMIN) (zip (update-value) keys values))
  )

  (defun update-value (key:string value:object{value-schema})
    "Update the value stored at key. Can only be used from within the module."

    (require-capability (STORAGE))
    (enforce
      (>= (diff-time (at "timestamp" value) UNIX_EPOCH) 0.0)
      "Timestamp should be positive")

    (write storage key value)
    (emit-event (UPDATE key value))
  )
)

(if (read-msg "upgrade")
  ["upgrade"]
  [
    (create-table storage)
  ]
)
