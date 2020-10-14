const Usuario = require('../models/Usuario');
const Producto = require('../models/Producto');
const Cliente = require('../models/Cliente');
const Pedido = require('../models/Pedido')
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { error } = require('server/router');
require('dotenv').config({ path: "variables.env" });

//aux
const crearToken = (usuario, secreta, expiresIn) => {
    const { id, email, nombre, apellido } = usuario
    return jwt.sign({ id, email, nombre, apellido }, secreta, { expiresIn })
}

// Resolvers
const resolvers = {
    Query: {
        obtenerUsuario: async (_, {}, ctx) => {
            return ctx.usuario
        },

        obtenerProductos: async () => {
            try {
                const productos = await Producto.find({});
                return productos;
            } catch (error) {
                console.log(error);
            }
        },

        obtenerProducto: async (_, { id }) => {
            const producto = await Producto.findById(id)
            console.log(producto)
            if (!producto) {
                throw new Error("Producto No encontrado")
            }

            return producto
        },

        obtenerClientes: async (_, { input }, ctx) => {
            try {
                if (!ctx.usuario) {
                    return new Error('No tenes autorizacion para ver estos datos');
                }
                const clientes = Cliente.find({})
                return clientes
            } catch (error) {
                console.log(error)
            }
        },
        obtenerClientesVendedor: async (_, { input }, ctx) => {
            const clientes = Cliente.find({ vendedor: ctx.usuario.id.toString() })
            return clientes
        },
        obtenerCliente: async (_, { id }, ctx) => {
            const cliente = await Cliente.findById(id)
            if (!cliente) {
                throw new Error("El cliente no existe")
            }
            if (cliente.vendedor.toString() != ctx.usuario.id.toString()) {
                throw new Error("ese cliente pertenece a otro usuario")
            }
            return cliente
        },
        obtenerPedidos: async (_, { id }, ctx) => {
            if (!ctx.usuario) {
                throw new Error("No tenes autorizacion para acceder a estos datos");
            }
            const pedidos = await Pedido.find({});

            return pedidos
        },
        obtenerPedidosVendedor: async (_, { }, ctx) => {
            if (!ctx.usuario) {
                throw new Error("No estas autenticado");
            }
            const pedidos = await Pedido.find({ vendedor: ctx.usuario.id }).populate('cliente')
            return pedidos
        },
        obtenerPedido: async (_, { id }, ctx) => {
            const pedido = await Pedido.findById(id)
            if (!pedido) {
                throw new Error("Este pedido no existe")
            }
            if (pedido.vendedor.toString() !== ctx.usuario.id.toString()) {
                throw new Error("Este pedido corresponde a otro vendedor");
            };

            return pedido
        },
        obtenerPedidosEstado: async (_, { estado }, ctx) => {
            if (!ctx.usuario) {
                throw new Error("Debes estar autenticado para acceder a estos datos")
            }
            const pedidos = await Pedido.find({ vendedor: ctx.usuario.id, estado })
            if (pedidos.length == 0) {
                throw new Error(`No existen pedidos ${estado}S para este vendedor`)
            }
            return pedidos
        },
        obtenerMejoresClientes: async (_, { }, ctx) => {
            if (!ctx.usuario) {
                throw new Error("Tienes que estar autentificado para acceder a estos datos")
            }
            const clientes = await Pedido.aggregate([
                { $match: { estado: "COMPLETADO" } },
                {
                    $group: {
                        _id: "$cliente",
                        total: { $sum: "$total" }
                    }
                },
                {
                    $lookup: {
                        from: "clientes",
                        localField: "_id",
                        foreignField: "_id",
                        as: "cliente"
                    }
                },
                {
                    $limit: 10
                },
                {
                    $sort: { total: -1 }
                }
            ]);
            return clientes;
        },
        obtenerMejoresVendedores: async (_, { }, ctx) => {
            if (!ctx.usuario) {
                throw new Error("Tienes que estar autentificado para acceder a estos datos")
            }
            const vendedores = await Pedido.aggregate([
                { $match: { estado: "COMPLETADO" } },
                {
                    $group: {
                        _id: "$vendedor",
                        total: { $sum: "$total" }
                    }
                },
                {
                    $lookup: {
                        from: "usuarios",
                        localField: "_id",
                        foreignField: "_id",
                        as: "vendedor"
                    }
                },
                {
                    $limit: 3
                },
                {
                    $sort: { total: -1 }
                }

            ]);
            return vendedores;
        },
        buscarProducto: async (_, { texto }, ctx) => {
            if (!ctx.usuario) {
                throw new Error("Debes estar autenticado para acceder a estos datos")
            }
            const productos = await Producto.find({ $text: { $search: texto } }).limit(2);

            if (productos.lenght == 0) {
                throw new Error("No se encontro ningun producto con esas caracteristicas");
            }
            return productos
        }

    },
    Mutation: {
        nuevoUsuario: async (_, { input }) => {

            const { email, password } = input;

            //revisar si el usuario ya esta registrado
            const existeUsuario = await Usuario.findOne({ email });
            if (existeUsuario) {
                throw new Error('El usuario ya existe');
            }

            //hashear la password
            const salt = await bcryptjs.genSalt(10);
            input.password = await bcryptjs.hash(password, salt);

            //Guardarlo en la db
            try {
                const usuario = new Usuario(input);
                usuario.save();
                return usuario
            } catch (error) {
                console.log(error)
            }
        },
        autenticarUsuario: async (_, { input }) => {

            const { email, password } = input;

            // si el usuario existe
            const existeUsuario = await Usuario.findOne({ email });
            if (!existeUsuario) {
                throw new Error('No existe el usuario')
            }

            //revisar si el password es correcto
            const passwordCorrecto = await bcryptjs.compare(password, existeUsuario.password);
            if (!passwordCorrecto) {
                throw new Error('Contraseña incorrecta')
            }
            //crear el token
            return {
                token: crearToken(existeUsuario, process.env.SECRETA, '24h')
            }
        },
        nuevoProducto: async (_, { input }) => {
            try {
                const nuevoProducto = new Producto(input);
                const resultado = await nuevoProducto.save();
                return resultado
            } catch (error) {
                console.log(error)
            }
        },
        actualizarProducto: async (_, { id, input }) => {
            let producto = await Producto.findById(id)
            if (!producto) {
                throw new Error("Producto No encontrado")
            }
            producto = Producto.findOneAndUpdate({ _id: id }, input, { new: true })

            return producto
        },
        eliminarProducto: async (_, { id }) => {
            let producto = await Producto.findById(id)
            if (!producto) {
                throw new Error("Producto No encontrado")
            }
            await Producto.findOneAndDelete({ _id: id })

            return "Producto Eliminado"
        },
        nuevoCliente: async (_, { input }, ctx) => {
            const { email } = input;
            const cliente = await Cliente.findOne({ email });
            if (cliente) {
                throw new Error('El cliente ya se encuentra registrado en la base de datos');
            }

            const nuevoCliente = new Cliente(input);
            nuevoCliente.vendedor = ctx.usuario.id

            const resultado = await nuevoCliente.save();
            return resultado
        },
        actualizarCliente: async (_, { id, input }, ctx) => {
            let cliente = await Cliente.findById(id);
            if (!cliente) {
                throw new Error("El Cliente no existe");
            }
            if (cliente.vendedor.toString() !== ctx.usuario.id.toString()) {
                throw new Error("No tenes permiso para modificar a este cliente")
            }
            cliente = await Cliente.findOneAndUpdate({ _id: id }, input, { new: true })

            return cliente
        },
        eliminarCliente: async (_, { id }, ctx) => {
            let cliente = await Cliente.findById(id);
            if (!cliente) {
                throw new Error("El cliente no Existe");
            }
            if (cliente.vendedor.toString() !== ctx.usuario.id.toString()) {
                throw new Error("No tienes permiso para eliminar a ese cliente")
            }
            cliente = await Cliente.findByIdAndDelete({ _id: id });
            return "Cliente Eliminado Correctamente"
        },
        nuevoPedido: async (_, { input }, ctx) => {
            const cliente = await Cliente.findById(input.cliente);
            if (!cliente) {
                throw new Error('El cliente no existe');
            }
            if (cliente.vendedor.toString() !== ctx.usuario.id.toString()) {
                throw new Error("Este clente pertenece a otro vendedor")
            }

            for await (const articulo of input.pedido) {
                const { id } = articulo;
                const producto = await Producto.findById(id);
                if (articulo.cantidad > producto.existencia) {
                    throw new Error("No hay suficiente Stock de: " + producto.nombre)
                }
            };
            for await (const articulo of input.pedido) {
                const { id, cantidad } = articulo;
                const producto = await Producto.findById(id);
                producto.existencia = producto.existencia - cantidad
                await producto.save()
            }

            const pedidoNuevo = new Pedido(input)
            pedidoNuevo.vendedor = ctx.usuario.id

            await pedidoNuevo.save()

            const resultado = await Pedido.findById(pedidoNuevo.id).populate('cliente') 
            return resultado
        },
        actualizarPedido: async (_, { id, input }, ctx) => {
            // pedido E! y pertenece al vendedor
            const pedido = await Pedido.findById(id);
            if (!pedido) {
                throw new Error("Este pedido no existe")
            }
            if (pedido.vendedor.toString() !== ctx.usuario.id.toString()) {
                throw new Error("Este pedido corresponde a otro vendedor");
            };
            // cliente E! y pertenece al vendedor
            const cliente = await Cliente.findById(input.cliente);
            if (!cliente) {
                throw new Error("Este cliente no existe")
            }
            if (cliente.vendedor.toString() !== ctx.usuario.id.toString()) {
                throw new Error("Este cliente corresponde a otro vendedor");
            };
            // actualizar stock
            if (input.pedido) {
                //revisar stock
                for await (articulo of input.pedido) {
                    const listaDePedidos = pedido.pedido
                    const articuloViejo = listaDePedidos.find(art =>  art.id.toString() == articulo.id.toString())
                    if (articulo.cantidad > articuloViejo.cantidad) {
                        const producto = await Producto.findById(articulo.id)
                        if (producto.existencia < (articulo.cantidad - articuloViejo.cantidad)) {
                            throw new Error("No hay suficiente stock de" + articulo.nombre)
                        }
                    }
                }
                // actualizar stock
                for await (articulo of input.pedido) {
                    const listaDePedidos = pedido.pedido
                    const articuloViejo = listaDePedidos.find(art => art.id.toString() == articulo.id.toString)
                    if (articulo.cantidad > articuloViejo.cantidad) {
                        const producto = await Producto.findById(articulo.id)
                        producto.existencia = producto.existencia - (articulo.cantidad - articuloViejo.cantidad)
                        await producto.save()
                    }
                    if (articulo.cantidad < articuloViejo.cantidad) {
                        const producto = await Producto.findById(articulo.id)
                        producto.existencia = producto.existencia + (articuloViejo.cantidad - articulo.cantidad)
                        await producto.save()
                    }
                }
            }
            const guardar = await Pedido.findOneAndUpdate({ _id: id.toString() }, input, { new: true })

            const resultado = await Pedido.findById(guardar.id).populate('cliente') 

            return resultado
        },
        eliminarPedido: async (_, { id }, ctx) => {
            const pedido = await Pedido.findById(id)
            if (!pedido) {
                throw new Error("El pedido no existe")
            }
            if (pedido.vendedor.toString() !== ctx.usuario.id.toString()) {
                throw new Error("No puedes eliminar a este pedido")
            }
            await Pedido.findOneAndDelete({ _id: id })
            return "El pedido fue eliminado Correctamente"
        }

    }
}

module.exports = resolvers;