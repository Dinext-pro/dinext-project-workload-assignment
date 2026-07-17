frappe.ui.form.on('Task', {
	refresh(frm) {
		setuFormPWA(frm);
	}
});

frappe.ui.form.on('Issue', {
	refresh(frm) {
		setuFormPWA(frm);
	}
});

/* Kanban monkey-patch removed (was debug-only). */

function setuFormPWA(frm) {
    if (!frm.doc.project) return;

    if ( frm.doctype == "Task" ) {
        open_pwa_onclick( frm, frm.doc );
    } else {
        frappe.db.get_list('Task', {
            fields: ['name', 'project', 'exp_start_date', 'exp_end_date'],
            filters: {
                custom_linked_issue: frm.docname
            },
            limit: 1
            }).then(records => {
                if ( records && records.length ) {
                    open_pwa_onclick( frm, records[ 0 ] );
                }
            })
    }
}

function open_pwa_onclick(frm, task) {
    const $assignContainer = frm.page.wrapper.find('.add-assignment-btn, .assignments .avatar-group');
    $assignContainer.off('click').on('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        open_pwa( frm, task );
    });
}

function reload( frm ) {
    frm.reload_doc();
    //frm.assign_to.refresh();
}

function open_pwa( frm, task ) {
    if ( frm.is_dirty() ) {
        frappe.warn(__('Confirm'),
            __('Changes will be saved. Continue?'),
            () => {
                frm.save( null, ()=> start_pwa( frm, task ) );
            },
            __('Continue'),
            false // Sets dialog as minimizable
        );
    } else {
        start_pwa( frm, task );
    }
}

function start_pwa( frm, task ) {
    start_pwa_dialog( ()=>reload( frm ), task );
}