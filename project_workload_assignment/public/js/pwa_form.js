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

/*const original_init = frappe.views.KanbanView.prototype.init;
frappe.views.KanbanView.prototype.init = function() {
	console.log('Kanban init bind');
    return original_init.call(this).then(() => {
        if (this.doctype === 'Issue' || this.doctype === 'Task') {
            const original_KanbanBoardColumn = frappe.views.KanbanBoardColumn;
            frappe.views.KanbanBoardColumn = function(column, wrapper, board_perms) {
                const self = original_KanbanBoardColumn.call(this, column, wrapper, board_perms);
                const original_make_cards = self.make_cards;
                self.make_cards = function() {
					console.log('make cards 1');
                    original_make_cards.call(this);
                    //setupListViewAssignmentFilter(this.cur_list);
                };

                return self;
            };
        }
    });
};/* */

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
        frappe.warn(__('Подтвердите'),
            __('Изменения данных будут сохранены. Продолжить?'),
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